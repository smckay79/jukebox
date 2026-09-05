import { getSession, getVideoPoToken, invalidateSession } from "./innertube.js";

// Inferred rather than imported from youtubei.js's internal class paths —
// those move across releases; the shapes we actually use (getBasicInfo's return
// value and chooseFormat's return value) are stable public API surface.
type Session = Awaited<ReturnType<typeof getSession>>;
export type VideoInfo = Awaited<ReturnType<Session["getBasicInfo"]>>;
export type Format = ReturnType<VideoInfo["chooseFormat"]>;

export type ExtractResult = {
  info: VideoInfo;
  // A progressive, combined video+audio format when YouTube still exposes
  // one. Official/label videos increasingly expose SABR-only adaptive
  // formats, so absence of this format is no longer an extraction failure;
  // server.ts routes those videos through the SABR -> HLS fallback.
  format?: Format;
  // The video-bound PO token used to obtain `info` — session.player.po_token
  // (a single shared field on the long-lived session) has to be reset to
  // this exact value immediately before every download() call, in case a
  // different video's extraction ran on the shared session in between and
  // overwrote it. See server.ts.
  poToken: string;
  quality: string;
};

export class VideoUnavailableError extends Error {}
export class ExtractionFailedError extends Error {}

// Auth-shaped failures (stale/rejected PO token) vs "video genuinely
// unavailable" need different handling — only the former should trigger a
// session refresh + retry. YouTube doesn't give us a clean error code here,
// so this is a best-effort string match against what youtubei.js/InnerTube
// actually say when a token's rejected.
function looksLikeAuthFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /sign in|login required|token|forbidden|401|403/i.test(msg);
}

// Only what we actually pass through to getBasicInfo — not imported from
// youtubei.js's own type since its export path moves across releases.
export type InnertubeClientName = "WEB" | "IOS";

async function extractOnce(
  videoId: string,
  client: InnertubeClientName,
): Promise<ExtractResult> {
  const yt = await getSession();
  // Fresh, video-bound PO token for THIS call — see innertube.ts for why the
  // session-level (visitor-bound) token alone isn't enough here.
  const videoPoToken = await getVideoPoToken(videoId);
  // Only the player response is needed. getInfo() would also fetch and parse the
  // entire watch-next page, adding latency and noisy parser warnings whenever
  // YouTube changes unrelated UI renderers.
  const info = await yt.getBasicInfo(videoId, {
    po_token: videoPoToken,
    client,
  });

  if (info.playability_status && info.playability_status.status !== "OK") {
    throw new VideoUnavailableError(
      info.playability_status.reason || info.playability_status.status,
    );
  }

  let format: Format | undefined;
  try {
    format = info.chooseFormat({ type: "video+audio", quality: "best" });
  } catch {
    // This is expected for SABR-only responses. Keep the parsed VideoInfo so
    // the fallback can use its adaptive formats and serverAbrStreamingUrl.
  }

  const streamingData = info.streaming_data;
  const hasSabrData = Boolean(
    streamingData?.server_abr_streaming_url &&
      info.player_config?.media_common_config.media_ustreamer_request_config
        ?.video_playback_ustreamer_config &&
      streamingData.adaptive_formats.some((candidate) => candidate.has_video) &&
      streamingData.adaptive_formats.some((candidate) => candidate.has_audio),
  );

  if (!format && !hasSabrData) {
    throw new ExtractionFailedError("No progressive or SABR formats available");
  }

  const bestAdaptiveVideo = streamingData?.adaptive_formats
    .filter((candidate) => candidate.has_video)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0];

  return {
    info,
    format,
    poToken: videoPoToken,
    quality:
      format?.quality_label ??
      format?.quality ??
      bestAdaptiveVideo?.quality_label ??
      bestAdaptiveVideo?.quality ??
      "unknown",
  };
}

export async function extractVideo(
  videoId: string,
  client: InnertubeClientName = "WEB",
): Promise<ExtractResult> {
  try {
    return await extractOnce(videoId, client);
  } catch (err) {
    if (err instanceof VideoUnavailableError) throw err;
    if (looksLikeAuthFailure(err)) {
      invalidateSession();
      return await extractOnce(videoId, client);
    }
    throw err;
  }
}
