import http from "node:http";
import { createReadStream } from "node:fs";
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
import {
  getHlsAsset,
  HLS_ASSET_RE,
  prewarmHls,
  sabrQuality,
  supportsSabr,
} from "./sabr-hls.js";

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
const ATTEMPT_TIMEOUT_MS = 8000;

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

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ATTEMPT_TIMEOUT_MS}ms`)),
      ATTEMPT_TIMEOUT_MS,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// 11-char base64url-ish YouTube video ID shape — same validation the web app
// uses elsewhere (src/lib/store.ts) for consistency.
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

async function resolveVideo(
  videoId: string,
  client: InnertubeClientName = "WEB",
): Promise<ExtractResult> {
  // The shared cache represents the normal WEB response used by both the
  // progressive and SABR paths. A last-ditch iOS attempt must not replace it
  // with client-specific formats that are invalid for a WEB SABR session.
  if (client !== "WEB") return extractVideo(videoId, client);
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
  if (!result.format) {
    throw new ExtractionFailedError("No progressive video+audio format available");
  }
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

// /video-info used to return a progressive URL without touching its bytes,
// which delayed the licensed-content 403 until AVPlayer was already loading
// it. Probe two bytes while Vercel is resolving the URL so SABR-only videos
// are sent to the HLS path up front. The result object is itself cached, so a
// WeakMap avoids repeating this CDN request for every caller.
const progressiveProbeCache = new WeakMap<ExtractResult, Promise<boolean>>();

function progressiveAvailable(result: ExtractResult): Promise<boolean> {
  if (!result.format) return Promise.resolve(false);
  const cached = progressiveProbeCache.get(result);
  if (cached) return cached;

  const probe = (async () => {
    try {
      const { reader, first } = await withTimeout(
        fetchFirstChunk(result, { start: 0, end: 1 }),
        "progressive probe",
      );
      await reader.cancel().catch(() => undefined);
      return !first.done && Boolean(first.value?.byteLength);
    } catch (error) {
      console.info(
        `[probe] progressive format unavailable (status ${upstreamStatus(error) ?? "?"}):`,
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  })();
  progressiveProbeCache.set(result, probe);
  return probe;
}

function hlsProxyUrl(videoId: string, expSeconds: number, sig: string): string {
  return `${PUBLIC_BASE_URL}/hls/${videoId}/${expSeconds}/${sig}/index.m3u8`;
}

function redirectToHls(
  res: http.ServerResponse,
  videoId: string,
  expSeconds: number,
  sig: string,
  result: ExtractResult,
): boolean {
  if (!supportsSabr(result)) return false;
  prewarmHls(videoId, result);
  res.writeHead(302, {
    location: hlsProxyUrl(videoId, expSeconds, sig),
    "cache-control": "no-store",
  });
  res.end();
  return true;
}

const HLS_PATH_RE =
  /^\/hls\/([A-Za-z0-9_-]{11})\/(\d+)\/([0-9a-f]{64})\/([^/]+)$/;

async function handleHlsAsset(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
) {
  const match = HLS_PATH_RE.exec(url.pathname);
  if (!match) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const [, videoId, expRaw, sig, assetName] = match;
  const expSeconds = Number(expRaw);
  if (
    !HLS_ASSET_RE.test(assetName) ||
    !verifyStreamToken(videoId, expSeconds, sig, SECRET)
  ) {
    sendJson(res, 403, { error: "Invalid or expired stream token" });
    return;
  }

  try {
    const asset = await getHlsAsset(videoId, assetName, () =>
      resolveVideo(videoId, "WEB"),
    );
    // A redirect from the progressive endpoint can carry AVPlayer's old
    // `Range: bytes=0-1` probe with it. Playlists must always be returned in
    // full; byte ranges are useful only for immutable media segments.
    const requestedRange =
      assetName === "index.m3u8"
        ? null
        : parseRange(req.headers.range, asset.size);
    if (
      requestedRange &&
      (requestedRange.start >= asset.size ||
        requestedRange.end < requestedRange.start)
    ) {
      res.writeHead(416, { "content-range": `bytes */${asset.size}` });
      res.end();
      return;
    }
    const range = requestedRange
      ? {
          start: requestedRange.start,
          end: Math.min(requestedRange.end, asset.size - 1),
        }
      : null;
    const headers: http.OutgoingHttpHeaders = {
      "content-type": asset.contentType,
      "cache-control":
        assetName === "index.m3u8" ? "no-store" : "private, max-age=3600",
    };
    if (assetName !== "index.m3u8") {
      headers["accept-ranges"] = "bytes";
    }

    if (range) {
      headers["content-range"] = `bytes ${range.start}-${range.end}/${asset.size}`;
      headers["content-length"] = String(range.end - range.start + 1);
      res.writeHead(206, headers);
    } else {
      headers["content-length"] = String(asset.size);
      res.writeHead(200, headers);
    }

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const file = createReadStream(asset.path, range ?? undefined);
    file.on("error", (error) => {
      console.error(`[hls] ${videoId}/${assetName} read failed:`, error.message);
      res.destroy(error);
    });
    file.pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[hls] ${videoId}/${assetName} failed:`, message);
    sendJson(res, 502, { error: "SABR playback preparation failed" });
  }
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

  if (!result.format) {
    if (redirectToHls(res, videoId, expSeconds, sig, result)) return;
    sendJson(res, 502, { error: "No progressive format available" });
    return;
  }
  const sabrFallbackResult = result;

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
  // client, which historically lags behind WEB on YouTube's newest
  // playback restrictions.
  //
  // The Android client used to be a fourth rung here. Removed: across
  // every real video tested, it never once succeeded OR failed — the
  // attempt just never completed at all (no timeout firing, no unhandled
  // rejection logged, nothing), even though /health kept responding
  // normally throughout, ruling out a blocked event loop. Root cause
  // undiagnosed; not worth the dead time it adds when it has never once
  // helped.
  const attempts: Array<() => Promise<ExtractResult>> = [
    async () => result,
    async () => {
      invalidateSession();
      deleteCached(videoId);
      return resolveVideo(videoId, "WEB");
    },
    async () => {
      return resolveVideo(videoId, "IOS");
    },
  ];

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let firstChunk: ReadableStreamReadResult<Uint8Array> | undefined;
  let lastErr: unknown;

  // Each attempt gets a hard time budget. Confirmed necessary against real
  // traffic: every video that reached the 4th (Android) attempt just hung
  // there indefinitely — no error, no timeout, nothing — leaving the tvOS
  // app waiting until it gave up client-side ("Operation stopped") instead
  // of ever getting a clean failure response. This can't cancel whatever's
  // actually stuck underneath, but it guarantees the ladder always
  // terminates and the client gets a real answer.
  for (let i = 0; i < attempts.length; i++) {
    try {
      result = await withTimeout(attempts[i](), `attempt ${i + 1}/${attempts.length} extraction`);
      const fetched = await withTimeout(fetchFirstChunk(result, range), `attempt ${i + 1}/${attempts.length} fetch`);
      reader = fetched.reader;
      firstChunk = fetched.first;
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[stream] ${videoId} attempt ${i + 1}/${attempts.length} failed (status ${upstreamStatus(err) ?? "?"}): ${message}`,
      );
    }
  }

  if (!reader || !firstChunk) {
    // The up-front probe normally routes these videos straight to HLS. Keep
    // this redirect as a race/expiry fallback in case the progressive URL
    // stops working between /video-info and AVPlayer's first byte request.
    if (redirectToHls(res, videoId, expSeconds, sig, sabrFallbackResult)) return;
    if (lastErr instanceof VideoUnavailableError) {
      sendJson(res, 404, { error: lastErr.message });
      return;
    }
    const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
    console.error(`[stream] ${videoId} all attempts failed:`, message);
    sendJson(res, 502, { error: "Upstream fetch failed" });
    return;
  }

  const finalFormat = result.format;
  if (!finalFormat) {
    if (redirectToHls(res, videoId, expSeconds, sig, sabrFallbackResult)) return;
    sendJson(res, 502, { error: "No progressive format available" });
    return;
  }

  // First chunk succeeded — safe to commit response headers now. Recompute
  // from `result` (not any earlier reference) since the iOS fallback above
  // may have swapped in a different format.
  const mimeType = finalFormat.mime_type?.split(";")[0] ?? "video/mp4";
  const headers: http.OutgoingHttpHeaders = {
    "content-type": mimeType,
    "accept-ranges": "bytes",
  };
  if (range) {
    headers["content-range"] = `bytes ${range.start}-${range.end}/${finalFormat.content_length ?? "*"}`;
    headers["content-length"] = String(range.end - range.start + 1);
    res.writeHead(206, headers);
  } else {
    if (finalFormat.content_length) {
      headers["content-length"] = String(finalFormat.content_length);
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


  if (
    (req.method === "GET" || req.method === "HEAD") &&
    url.pathname.startsWith("/hls/")
  ) {
    await handleHlsAsset(req, res, url);
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

    if (!(await progressiveAvailable(result))) {
      if (!supportsSabr(result)) {
        throw new ExtractionFailedError(
          "Progressive playback failed and SABR is unavailable",
        );
      }
      prewarmHls(videoId, result);
      sendJson(res, 200, {
        url: hlsProxyUrl(videoId, expSeconds, sig),
        type: "hls",
        quality: sabrQuality(result),
      });
      return;
    }

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
