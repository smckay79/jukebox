import { Innertube, Platform } from "youtubei.js";
import { fetchPoToken } from "./potoken-client.js";

// youtubei.js doesn't bundle a JS evaluator for descrambling signature-ciphered
// stream URLs (deliberately, per their docs — Node's `Function` constructor
// isn't safe/available in every runtime they support, e.g. Cloudflare
// Workers). Without this, format.decipher() throws
// "you must provide your own JavaScript evaluator". We're plain Node, so the
// documented Function-constructor shim is fine here. Confirmed required via
// actual end-to-end testing, not just the types — this is exactly the kind
// of thing that only shows up at runtime.
Platform.shim.eval = async (data, env) => {
  const properties: string[] = [];

  if (env.n) {
    properties.push(`n: exportedVars.nFunction("${env.n}")`);
  }
  if (env.sig) {
    properties.push(`sig: exportedVars.sigFunction("${env.sig}")`);
  }

  // youtubei.js 18's generated script defines `exportedVars`; its evaluator
  // contract expects the transformed n/signature values back as an object.
  // Merely evaluating data.output (the old shim) discards those values and
  // can leave both progressive and SABR URLs undeciphered.
  const code = `${data.output}\nreturn { ${properties.join(", ")} }`;
  return new Function(code)();
};

// One long-lived Innertube session + PO token for this process's entire
// lifetime, refreshed lazily. This only makes sense because the service is a
// single always-on container (Fly.io) — there'd be no benefit to this
// in-process caching on something like Vercel serverless, where every
// invocation is a fresh process anyway.
let innertube: Innertube | null = null;
let poTokenExpiresAt: Date | null = null;
let initPromise: Promise<Innertube> | null = null;

// Re-solve a bit before YouTube actually rejects the token, and treat any
// auth-shaped failure from a caller as an instant signal to refresh rather
// than waiting for the clock.
const REFRESH_MARGIN_MS = 30 * 60 * 1000;

async function buildSession(): Promise<Innertube> {
  const yt = await Innertube.create({ retrieve_player: true });
  const visitorData = yt.session.context.client.visitorData;
  const { poToken, expiresAt } = await fetchPoToken(visitorData);
  yt.session.po_token = poToken;
  poTokenExpiresAt = new Date(expiresAt);
  return yt;
}

async function refreshPoToken(yt: Innertube): Promise<void> {
  const visitorData = yt.session.context.client.visitorData;
  const { poToken, expiresAt } = await fetchPoToken(visitorData, /* bypassCache */ true);
  yt.session.po_token = poToken;
  poTokenExpiresAt = new Date(expiresAt);
}

function isStale(): boolean {
  if (!poTokenExpiresAt) return true;
  return Date.now() >= poTokenExpiresAt.getTime() - REFRESH_MARGIN_MS;
}

// Returns a ready-to-use Innertube session, building it on first call and
// refreshing the PO token as needed. Concurrent callers share the same
// in-flight init/refresh instead of each kicking off their own BotGuard solve.
export async function getSession(): Promise<Innertube> {
  if (!innertube) {
    if (!initPromise) initPromise = buildSession();
    innertube = await initPromise;
    return innertube;
  }
  if (isStale()) {
    if (!initPromise) initPromise = refreshPoToken(innertube).then(() => innertube!);
    await initPromise;
    initPromise = null;
  }
  return innertube;
}

// Called by extract.ts when a request fails in a way that looks like a stale
// or rejected token (as opposed to "video doesn't exist") — forces the next
// getSession() call to refresh instead of waiting out the normal TTL.
export function invalidateSession(): void {
  poTokenExpiresAt = null;
}

// The session-level PO token above is bound to visitor data and is fine for
// general Innertube API calls, but per yt-dlp's PO-Token-Guide, the token
// that actually has to satisfy YouTube's player/streaming auth check is
// bound to the SPECIFIC VIDEO being played, not the visitor. Reusing one
// visitor-bound token across every video (the original version of this file)
// is exactly what caused "Sign in to confirm you're not a bot" on the
// player request even though the session-level token was valid — confirmed
// by testing against a real deployment, not just inferred from docs. So we
// mint a fresh, video-bound token for each extraction; the sidecar caches
// these itself (see potoken-client.ts / bgutil-ytdlp-pot-provider's own
// per-content-binding cache), so repeat requests for the same video are
// still cheap.
export async function getVideoPoToken(videoId: string): Promise<string> {
  const { poToken } = await fetchPoToken(videoId);
  return poToken;
}
