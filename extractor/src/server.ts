import http from "node:http";
import {
  extractVideo,
  VideoUnavailableError,
  ExtractionFailedError,
  type ExtractResult,
  type InnertubeClientName,
} from "./extract.js";
import { providerHealthy } from "./potoken-client.js";
import { getCached, setCached, deleteCached } from "./cache.js";
import { signStreamToken, verifyStreamToken } from "./sign.js";
import { getSession, invalidateSession } from "./innertube.js";

const PORT = Number(process.env.PORT ?? 8080);
const SHARED_SECRET = process.env.EXTRACTOR_SHARED_SECRET;
// Used to build the /stream URL handed back from /video-info — must be the
// public URL this container is reachable at (e.g. the Cloudflare Tunnel
// hostname), not localhost, since the tvOS app fetches it from elsewhere.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(
  /\/+$/,
  "",
);
const STREAM_TOKEN_TTL_SECONDS = 6 * 60 * 60;

if (!SHARED_SECRET) {
  console.error("EXTRACTOR_SHARED_SECRET is not set — refusing to start.");
  process.exit(1);
}
const SECRET: string = SHARED_SECRET;

// Last-resort net: this is an always-on service for a live party, so one
// video's streaming error must never take the whole container (and every
// other listener's playback) down. handleStream below drives its own
// read loop specifically so upstream failures surface as normal rejected
// promises instead of unhandled stream 'error' events — this is only for
// anything we haven't anticipated.
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException (recovered):", err instanceof Error ? err.stack ?? err.message : String(err));
});
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection (recovered):", reason instanceof Error ? reason.stack ?? reason.message : String(reason));
});

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// 11-char base64url-ish YouTube video ID shape — same validation the web app
// uses elsewhere (src/lib/store.ts) for consistency.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

async function resolveVideo(
  videoId: string,
  client: InnertubeClientName = "WEB",
): Promise<ExtractResult> {
  const cached = getCached(videoId);
  if (cached) return cached;
  const result = await extractVideo(videoId, client);
  setCached(videoId, result);
  return result;
}

function parseRange(
  rangeHeader: string | undefined,
  contentLength: number | undefined,
): { start: number; end: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d+)-(\d+)?$/.exec(rangeHeader);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2]
    ? Number(match[2])
    : contentLength
      ? contentLength - 1
      : start + 10 * 1024 * 1024 - 1;
  return { start, end };
}

// download() throws an InnertubeError carrying the real upstream Response
// on a non-2xx (see youtubei.js's utils/FormatUtils.js) — pull the status
// back out purely for clearer logging.
function upstreamStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "info" in err) {
    const info = (err as { info?: { response?: { status?: number } } }).info;
    return info?.response?.status;
  }
  return undefined;
}

// session.player.po_token is a single field on the long-lived, shared
// Innertube session (see extract.ts) — reset it to THIS video's token
// immediately before every download() call, in case a different video's
// extraction ran on the shared session in between and overwrote it.
async function downloadBody(result: ExtractResult, range: { start: number; end: number } | null) {
  const yt = await getSession();
  if (yt.session.player) {
    yt.session.player.po_token = result.poToken;
  }
  return result.info.download({
    type: "video+audio",
    quality: "best",
    ...(range ? { range } : {}),
  });
}

// Fetches the FIRST chunk eagerly (rather than handing back an unread
// stream) so a failure surfaces as a normal rejected promise we can retry
// on, before we've committed any response headers to the client. This
// matters specifically because download()'s chunked/ranged branch (which
// is what every real request hits — AVPlayer always sends a Range header,
// even its very first probe) defers the actual upstream fetch until the
// stream is *read*; naively piping it and catching errors afterward means
// any failure arrives well after headers are already sent, too late to
// retry — confirmed against real traffic.
async function fetchFirstChunk(
  result: ExtractResult,
  range: { start: number; end: number } | null,
) {
  const stream = await downloadBody(result, range);
  const reader = stream.getReader();
  const first = await reader.read();
  return { reader, first };
}

// YouTube's playback CDN ties a signed googlevideo.com URL to the IP that
// requested it (part of the same PO-token/BotGuard enforcement that pushed
// us onto a residential host in the first place) — a client fetching that
// URL directly from a different network gets a 403 partway through a
// redirect chain, confirmed by testing. So instead of handing the raw URL
// to the tvOS app, we hand out a signed URL on our own domain and proxy the
// actual bytes through this container, whose IP is the one that's
// authorized — via youtubei.js's own VideoInfo.download(), which (unlike a
// plain fetch of the deciphered URL) correctly handles the `cpn=` param and
// YouTube's own `range=` query-parameter convention for chunked fetches
// (NOT a standard Range header) that stricter/licensed formats enforce.
async function handleStream(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
) {
  const videoId = url.searchParams.get("id") ?? "";
  const expSeconds = Number(url.searchParams.get("exp") ?? "");
  const sig = url.searchParams.get("sig") ?? "";

  if (
    !VIDEO_ID_RE.test(videoId) ||
    !verifyStreamToken(videoId, expSeconds, sig, SECRET)
  ) {
    sendJson(res, 403, { error: "Invalid or expired stream token" });
    return;
  }

  let result: ExtractResult;
  try {
    result = await resolveVideo(videoId, "WEB");
  } catch (err) {
    if (err instanceof VideoUnavailableError) {
      sendJson(res, 404, { error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[stream] ${videoId} resolve failed:`, message);
    sendJson(res, 502, { error: "Extraction failed" });
    return;
  }

  if (req.method === "HEAD") {
    const headers: http.OutgoingHttpHeaders = {
      "content-type": result.format.mime_type?.split(";")[0] ?? "video/mp4",
      "accept-ranges": "bytes",
    };
    if (result.format.content_length) {
      headers["content-length"] = String(result.format.content_length);
    }
    res.writeHead(200, headers);
    res.end();
    return;
  }

  const range = parseRange(req.headers.range, result.format.content_length);

  // Some formats — confirmed against real major-label official music
  // videos — 403 on the actual byte-fetch even with an otherwise fully
  // correct WEB-client request (pot=, cpn=, and YouTube's own range=
  // convention all present). Escalate: retry once with a completely fresh
  // WEB extraction (new PO token, new session), then fall back to the iOS
  // and Android clients, which historically lag behind WEB on YouTube's
  // newest playback restrictions — iOS in particular often has no combined
  // progressive format at all for a given video (confirmed: "No matching
  // formats found" for a video WEB does have one for, just 403s on it), so
  // Android is worth a separate attempt rather than assuming iOS covers it.
  const attempts: Array<() => Promise<ExtractResult>> = [
    async () => result,
    async () => {
      invalidateSession();
      deleteCached(videoId);
      return resolveVideo(videoId, "WEB");
    },
    async () => {
      deleteCached(videoId);
      return resolveVideo(videoId, "IOS");
    },
    async () => {
      deleteCached(videoId);
      return resolveVideo(videoId, "ANDROID");
    },
  ];

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let firstChunk: ReadableStreamReadResult<Uint8Array> | undefined;
  let lastErr: unknown;

  for (let i = 0; i < attempts.length; i++) {
    try {
      result = await attempts[i]();
      const fetched = await fetchFirstChunk(result, range);
      reader = fetched.reader;
      firstChunk = fetched.first;
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      if (i < attempts.length - 1) {
        console.warn(
          `[stream] ${videoId} attempt ${i + 1}/${attempts.length} failed (status ${upstreamStatus(err) ?? "?"}), escalating`,
        );
      }
    }
  }

  if (!reader || !firstChunk) {
    if (lastErr instanceof VideoUnavailableError) {
      sendJson(res, 404, { error: lastErr.message });
      return;
    }
    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.error(`[stream] ${videoId} all attempts failed:`, message);
    sendJson(res, 502, { error: "Upstream fetch failed" });
    return;
  }

  // First chunk succeeded — safe to commit response headers now. Recompute
  // from `result` (not any earlier reference) since the iOS fallback above
  // may have swapped in a different format.
  const mimeType = result.format.mime_type?.split(";")[0] ?? "video/mp4";
  const headers: http.OutgoingHttpHeaders = {
    "content-type": mimeType,
    "accept-ranges": "bytes",
  };
  if (range) {
    headers["content-range"] = `bytes ${range.start}-${range.end}/${result.format.content_length ?? "*"}`;
    headers["content-length"] = String(range.end - range.start + 1);
    res.writeHead(206, headers);
  } else {
    if (result.format.content_length) {
      headers["content-length"] = String(result.format.content_length);
    }
    res.writeHead(200, headers);
  }

  if (firstChunk.value) {
    res.write(Buffer.from(firstChunk.value));
  }
  if (firstChunk.done) {
    res.end();
    return;
  }

  // Stream the rest. A failure here happens after headers (and possibly
  // some bytes) are already committed to the client, so there's no
  // retrying left to do — just abort the connection cleanly. AVPlayer
  // treats a truncated response as a normal transient failure and
  // re-requests, same as any other network hiccup.
  const activeReader = reader;
  (async () => {
    try {
      while (true) {
        const { done, value } = await activeReader.read();
        if (done) break;
        if (!res.write(Buffer.from(value))) {
          await new Promise<void>((resolve) => res.once("drain", resolve));
        }
      }
      res.end();
    } catch (err) {
      console.error(`[stream] ${videoId} mid-stream error:`, err instanceof Error ? err.message : String(err));
      res.destroy();
    }
  })();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const potokenOk = await providerHealthy();
    sendJson(res, potokenOk ? 200 : 503, { ok: potokenOk, potokenProvider: potokenOk });
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/stream") {
    await handleStream(req, res, url);
    return;
  }

  if (req.method !== "GET" || url.pathname !== "/video-info") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${SECRET}`;
  if (auth !== expected) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  const videoId = url.searchParams.get("id") ?? "";
  if (!VIDEO_ID_RE.test(videoId)) {
    sendJson(res, 400, { error: "Missing or invalid ?id= parameter" });
    return;
  }

  try {
    const result = await resolveVideo(videoId);
    const expSeconds = Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SECONDS;
    const sig = signStreamToken(videoId, expSeconds, SECRET);
    const proxyUrl = `${PUBLIC_BASE_URL}/stream?id=${encodeURIComponent(videoId)}&exp=${expSeconds}&sig=${sig}`;
    sendJson(res, 200, { url: proxyUrl, type: "mp4", quality: result.quality });
  } catch (err) {
    if (err instanceof VideoUnavailableError) {
      sendJson(res, 404, { error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[extract] ${videoId} failed:`, message);
    sendJson(res, 502, {
      error: err instanceof ExtractionFailedError ? message : "Extraction failed",
    });
  }
});

server.listen(PORT, () => {
  console.log(`videojam-extractor listening on :${PORT}`);
});
