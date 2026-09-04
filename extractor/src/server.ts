import http from "node:http";
import { Readable } from "node:stream";
import { extractVideo, VideoUnavailableError, ExtractionFailedError } from "./extract.js";
import { providerHealthy } from "./potoken-client.js";
import { getCached, setCached } from "./cache.js";
import { signStreamToken, verifyStreamToken } from "./sign.js";

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

async function resolveVideo(videoId: string) {
  const cached = getCached(videoId);
  if (cached) return cached;
  const result = await extractVideo(videoId);
  setCached(videoId, result);
  return result;
}

// YouTube's playback CDN ties a signed googlevideo.com URL to the IP that
// requested it (part of the same PO-token/BotGuard enforcement that pushed
// us onto a residential host in the first place) — a client fetching that
// URL directly from a different network gets a 403 partway through a
// redirect chain, confirmed by testing. So instead of handing the raw URL
// to the tvOS app, we hand out a signed URL on our own domain and proxy the
// actual bytes through this container, whose IP is the one that's
// authorized.
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

  let result;
  try {
    result = await resolveVideo(videoId);
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

  const range = req.headers.range;
  const upstream = await fetch(result.url, {
    method: req.method === "HEAD" ? "HEAD" : "GET",
    headers: range ? { range } : {},
  });

  if (!upstream.ok && upstream.status !== 206) {
    console.error(`[stream] ${videoId} upstream returned ${upstream.status}`);
    sendJson(res, 502, { error: `Upstream returned ${upstream.status}` });
    return;
  }

  const headers: http.OutgoingHttpHeaders = {};
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  res.writeHead(upstream.status, headers);

  if (req.method === "HEAD" || !upstream.body) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body as import("stream/web").ReadableStream).pipe(res);
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
    const expSeconds = result.expiresAt
      ? Math.floor(new Date(result.expiresAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + STREAM_TOKEN_TTL_SECONDS;
    const sig = signStreamToken(videoId, expSeconds, SECRET);
    const proxyUrl = `${PUBLIC_BASE_URL}/stream?id=${encodeURIComponent(videoId)}&exp=${expSeconds}&sig=${sig}`;
    sendJson(res, 200, { ...result, url: proxyUrl });
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
