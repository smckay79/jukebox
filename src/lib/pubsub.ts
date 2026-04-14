import Redis from "ioredis";
import type { PublicParty } from "./types";

// Redis TCP URL from the Vercel/Upstash integration. Used for pub/sub, which
// the REST client cannot do (REST is stateless). Falls back to REDIS_URL for
// non-Vercel setups.
function tcpUrl(): string | null {
  return (
    process.env.KV_URL ??
    process.env.REDIS_URL ??
    process.env.UPSTASH_REDIS_URL ??
    null
  );
}

// Shared singleton publisher — safe to reuse across requests because
// `PUBLISH` is stateless from the client's perspective.
let pubClient: Redis | null | undefined;
function getPub(): Redis | null {
  if (pubClient !== undefined) return pubClient;
  const url = tcpUrl();
  if (!url) {
    pubClient = null;
    return null;
  }
  pubClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
  });
  // Swallow transient connection errors — losing a publish is not fatal.
  pubClient.on("error", () => {});
  return pubClient;
}

export function channelFor(code: string): string {
  return `party:${code.toUpperCase()}:updates`;
}

export async function publishPartyUpdate(
  code: string,
  publicParty: PublicParty,
): Promise<void> {
  const pub = getPub();
  if (!pub) return;
  try {
    await pub.publish(channelFor(code), JSON.stringify(publicParty));
  } catch {
    // A failed publish just means connected clients will catch up via their
    // safety-net poll. Don't break the originating write.
  }
}

// Fresh subscriber per SSE connection. A Redis client in subscribe mode
// can't run other commands, so we never share these.
export function createSubscriber(): Redis | null {
  const url = tcpUrl();
  if (!url) return null;
  const sub = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 2,
    enableReadyCheck: false,
  });
  sub.on("error", () => {});
  return sub;
}
