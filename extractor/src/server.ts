import http from "node:http";
import { extractVideo, VideoUnavailableError, ExtractionFailedError } from "./extract.js";
import { providerHealthy } from "./potoken-client.js";

const PORT = Number(process.env.PORT ?? 8080);
const SHARED_SECRET = process.env.EXTRACTOR_SHARED_SECRET;

if (!SHARED_SECRET) {
  console.error("EXTRACTOR_SHARED_SECRET is not set — refusing to start.");
  process.exit(1);
}

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    const potokenOk = await providerHealthy();
    sendJson(res, potokenOk ? 200 : 503, { ok: potokenOk, potokenProvider: potokenOk });
    return;
  }

  if (req.method !== "GET" || url.pathname !== "/video-info") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${SHARED_SECRET}`;
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
    const result = await extractVideo(videoId);
    sendJson(res, 200, result);
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
