import { getParty, toPublicParty } from "@/lib/store";
import { channelFor, createSubscriber } from "@/lib/pubsub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Pro: allows the SSE connection to run long. On Hobby, the platform
// will still cut it before this — EventSource in the browser auto-reconnects.
export const maxDuration = 60;

const encoder = new TextEncoder();

function sseEvent(obj: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseComment(msg: string): Uint8Array {
  return encoder.encode(`: ${msg}\n\n`);
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const code = params.code.toUpperCase();
  const party = await getParty(code);
  if (!party) {
    return new Response(JSON.stringify({ error: "Party not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  const subscriber = createSubscriber();
  const channel = channelFor(code);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeClose = () => {
        if (closed) return;
        closed = true;
        try {
          subscriber?.unsubscribe(channel).catch(() => {});
          subscriber?.quit().catch(() => {});
        } catch {
          /* ignore */
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // 1) Push the current state immediately so the client is in sync on
      //    connect/reconnect (covers any updates it might have missed).
      controller.enqueue(sseEvent(toPublicParty(party)));

      // 2) If we have a subscriber, forward every publish to the client.
      if (subscriber) {
        try {
          await subscriber.subscribe(channel);
        } catch {
          // Subscribe failed — fall back to "initial snapshot + heartbeats".
          // The client's safety-net poll will keep it up to date.
        }
        subscriber.on("message", (ch, msg) => {
          if (ch !== channel || closed) return;
          try {
            // Pass the raw JSON through — it's already a serialized PublicParty.
            controller.enqueue(encoder.encode(`data: ${msg}\n\n`));
          } catch {
            safeClose();
          }
        });
        subscriber.on("end", safeClose);
        subscriber.on("error", safeClose);
      }

      // 3) Heartbeat every 15s to keep idle connections alive through any
      //    proxy in the path. Also gives us a place to notice client aborts.
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(sseComment("keepalive"));
        } catch {
          clearInterval(heartbeat);
          safeClose();
        }
      }, 15_000);

      // 4) Hard cap at ~55s so we end cleanly within Vercel's function window
      //    on Pro. Hobby will cut sooner; EventSource reconnects either way.
      const maxMs = 55_000;
      const deadline = setTimeout(() => {
        clearInterval(heartbeat);
        safeClose();
      }, maxMs);

      // 5) Browser navigated away / closed the tab.
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        clearTimeout(deadline);
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    },
  });
}
