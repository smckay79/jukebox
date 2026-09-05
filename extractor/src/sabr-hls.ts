import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, type Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Constants } from "youtubei.js";
import { SabrStream } from "googlevideo/sabr-stream";
import type { SabrFormat } from "googlevideo/shared-types";
import { buildSabrFormat, EnabledTrackTypes } from "googlevideo/utils";
import type { ExtractResult } from "./extract.js";
import { getSession, getVideoPoToken } from "./innertube.js";

const HLS_ROOT = process.env.HLS_CACHE_DIR ?? path.join(os.tmpdir(), "videojam-hls");
const HLS_READY_TIMEOUT_MS = Number(process.env.HLS_READY_TIMEOUT_MS ?? 45_000);
const HLS_SESSION_TTL_MS = Number(process.env.HLS_SESSION_TTL_MS ?? 2 * 60 * 60 * 1000);
const MAX_HLS_SESSIONS = Number(process.env.MAX_HLS_SESSIONS ?? 4);

export const HLS_PLAYLIST_NAME = "index.m3u8";
export const HLS_ASSET_RE = /^(?:index\.m3u8|segment-\d+\.ts)$/;

type HlsSession = {
  videoId: string;
  directory: string;
  playlistPath: string;
  ready: Promise<void>;
  done: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  readySettled: boolean;
  lastAccessedAt: number;
  error?: Error;
  sabrStream?: SabrStream;
  ffmpeg?: ChildProcess;
};

export type HlsAsset = {
  path: string;
  size: number;
  contentType: "application/vnd.apple.mpegurl" | "video/mp2t";
};

const sessions = new Map<string, HlsSession>();

// Docker restarts preserve a container's writable layer. Remove only
// directories matching our own strict session-name shape so abandoned HLS
// files cannot accumulate, while leaving any unrelated/configured cache-root
// contents alone.
const rootReady = (async () => {
  await mkdir(HLS_ROOT, { recursive: true });
  const entries = await readdir(HLS_ROOT, { withFileTypes: true });
  const orphanName = /^[A-Za-z0-9_-]{11}-\d+-[0-9a-f]+$/;
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && orphanName.test(entry.name))
      .map((entry) =>
        rm(path.join(HLS_ROOT, entry.name), { recursive: true, force: true }),
      ),
  );
})();
void rootReady.catch(() => undefined);

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function supportsSabr(result: ExtractResult): boolean {
  const streamingData = result.info.streaming_data;
  const ustreamerConfig =
    result.info.player_config?.media_common_config.media_ustreamer_request_config
      ?.video_playback_ustreamer_config;

  return Boolean(
    streamingData?.server_abr_streaming_url &&
      ustreamerConfig &&
      streamingData.adaptive_formats.some((format) => format.has_video) &&
      streamingData.adaptive_formats.some((format) => format.has_audio),
  );
}

export function sabrQuality(result: ExtractResult): string {
  const formats = result.info.streaming_data?.adaptive_formats.map((format) =>
    buildSabrFormat(format),
  );
  return (formats && selectVideoFormat(formats)?.qualityLabel) || result.quality;
}

function selectVideoFormat(formats: SabrFormat[]): SabrFormat | undefined {
  const h264 = formats.filter(
    (format) =>
      format.mimeType?.includes("video/mp4") &&
      format.mimeType.includes("avc"),
  );
  const atMost720p = h264.filter((format) => (format.height ?? 0) <= 720);
  const candidates = atMost720p.length > 0 ? atMost720p : h264;
  return candidates.sort(
    (a, b) =>
      (b.height ?? 0) - (a.height ?? 0) ||
      (b.bitrate ?? 0) - (a.bitrate ?? 0),
  )[0];
}

function selectAudioFormat(formats: SabrFormat[]): SabrFormat | undefined {
  const aac = formats.filter(
    (format) =>
      format.mimeType?.includes("audio/mp4") &&
      format.mimeType.includes("mp4a") &&
      !format.isDrc,
  );
  const original = aac.filter((format) => format.isOriginal);
  const candidates = original.length > 0 ? original : aac;
  return candidates.sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
}

function settleReady(session: HlsSession, error?: Error): void {
  if (session.readySettled) return;
  session.readySettled = true;
  if (error) {
    session.rejectReady(error);
  } else {
    session.resolveReady();
  }
}

async function monitorPlaylist(session: HlsSession): Promise<void> {
  const deadline = Date.now() + HLS_READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (session.error) throw session.error;
    try {
      const playlist = await readFile(session.playlistPath, "utf8");
      if (playlist.includes("#EXTINF:") && playlist.includes("segment-")) {
        settleReady(session);
        return;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(100);
  }

  throw new Error(`HLS playlist was not ready after ${HLS_READY_TIMEOUT_MS}ms`);
}

function ffmpegExit(child: ChildProcess, stderr: () => string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (code === 0) {
        finish();
      } else {
        const detail = stderr().trim();
        finish(
          new Error(
            `ffmpeg exited with ${code ?? signal ?? "unknown status"}${detail ? `: ${detail}` : ""}`,
          ),
        );
      }
    });
  });
}

async function configureSabrStream(
  videoId: string,
  result: ExtractResult,
): Promise<{
  sabrStream: SabrStream;
  videoStream: ReadableStream<Uint8Array>;
  audioStream: ReadableStream<Uint8Array>;
}> {
  const yt = await getSession();
  const streamingData = result.info.streaming_data;
  const ustreamerConfig =
    result.info.player_config?.media_common_config.media_ustreamer_request_config
      ?.video_playback_ustreamer_config;

  if (!streamingData?.server_abr_streaming_url || !ustreamerConfig) {
    throw new Error("YouTube response did not include SABR configuration");
  }
  if (!yt.session.player) {
    throw new Error("youtubei.js player is unavailable for SABR URL deciphering");
  }

  // The player object is shared, so restore this video's content-bound token
  // immediately before deciphering its SABR URL.
  yt.session.player.po_token = result.poToken;
  const serverAbrStreamingUrl = await yt.session.player.decipher(
    streamingData.server_abr_streaming_url,
  );
  const formats = streamingData.adaptive_formats.map((format) =>
    buildSabrFormat(format),
  );
  const clientName = yt.session.context.client.clientName;
  const clientNameId =
    Constants.CLIENT_NAME_IDS[
      clientName as keyof typeof Constants.CLIENT_NAME_IDS
    ];

  if (!clientNameId) {
    throw new Error(`Unknown InnerTube client name: ${clientName}`);
  }

  const durationSeconds = result.info.basic_info.duration;
  const sabrStream = new SabrStream({
    formats,
    serverAbrStreamingUrl,
    videoPlaybackUstreamerConfig: ustreamerConfig,
    poToken: result.poToken,
    ...(durationSeconds && Number.isFinite(durationSeconds)
      ? { durationMs: durationSeconds * 1000 }
      : {}),
    clientInfo: {
      clientName: Number(clientNameId),
      clientVersion: yt.session.context.client.clientVersion,
    },
  });

  // A reload is uncommon during a short music video, but YouTube can request
  // one after an IP/URL change. Refresh all three SABR credentials together.
  sabrStream.on("reloadPlayerResponse", () => {
    void (async () => {
      const poToken = await getVideoPoToken(videoId);
      const refreshed = await yt.getBasicInfo(videoId, {
        po_token: poToken,
        client: "WEB",
      });
      const refreshedUrl = refreshed.streaming_data?.server_abr_streaming_url;
      const refreshedConfig =
        refreshed.player_config?.media_common_config.media_ustreamer_request_config
          ?.video_playback_ustreamer_config;
      if (!refreshedUrl || !refreshedConfig || !yt.session.player) return;

      yt.session.player.po_token = poToken;
      sabrStream.setPoToken(poToken);
      sabrStream.setStreamingURL(
        await yt.session.player.decipher(refreshedUrl),
      );
      sabrStream.setUstreamerConfig(refreshedConfig);
    })().catch((error) => {
      console.warn(
        `[sabr] ${videoId} player-response reload failed:`,
        asError(error).message,
      );
    });
  });

  const { videoStream, audioStream } = await sabrStream.start({
    videoFormat: selectVideoFormat,
    audioFormat: selectAudioFormat,
    enabledTrackTypes: EnabledTrackTypes.VIDEO_AND_AUDIO,
    maxRetries: 4,
    stallDetectionMs: 20_000,
  });

  return { sabrStream, videoStream, audioStream };
}

async function runSession(
  session: HlsSession,
  result: ExtractResult,
): Promise<void> {
  await rootReady;
  await mkdir(session.directory, { recursive: true });

  const { sabrStream, videoStream, audioStream } = await configureSabrStream(
    session.videoId,
    result,
  );
  session.sabrStream = sabrStream;

  const segmentPattern = path.join(session.directory, "segment-%05d.ts");
  const child = spawn(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "warning",
      "-thread_queue_size",
      "512",
      "-i",
      "pipe:3",
      "-thread_queue_size",
      "512",
      "-i",
      "pipe:4",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "copy",
      "-c:a",
      "copy",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_list_size",
      "0",
      "-hls_playlist_type",
      "event",
      "-hls_flags",
      "independent_segments+temp_file",
      "-hls_segment_filename",
      segmentPattern,
      session.playlistPath,
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] },
  );
  session.ffmpeg = child;

  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr = (stderr + chunk).slice(-16_384);
  });

  const videoInput = child.stdio[3] as Writable;
  const audioInput = child.stdio[4] as Writable;
  const processExit = ffmpegExit(child, () => stderr);

  void monitorPlaylist(session).catch((error) => {
    const failure = asError(error);
    session.error = failure;
    settleReady(session, failure);
    sabrStream.abort();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  });

  try {
    await Promise.all([
      pipeline(Readable.fromWeb(videoStream as never), videoInput),
      pipeline(Readable.fromWeb(audioStream as never), audioInput),
      processExit,
    ]);
    // A very short video may finish before the polling loop observes the
    // playlist. Verify it one final time before declaring readiness failed.
    if (!session.readySettled) {
      const playlist = await readFile(session.playlistPath, "utf8");
      if (!playlist.includes("#EXTINF:")) {
        throw new Error("ffmpeg produced an empty HLS playlist");
      }
      settleReady(session);
    }
    console.info(`[sabr] ${session.videoId} HLS packaging complete`);
  } catch (error) {
    sabrStream.abort();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    throw error;
  }
}

async function removeSession(session: HlsSession): Promise<void> {
  if (sessions.get(session.videoId) === session) {
    sessions.delete(session.videoId);
  }
  if (session.ffmpeg?.exitCode === null) {
    session.sabrStream?.abort();
    session.ffmpeg.kill("SIGTERM");
  }
  await rm(session.directory, { recursive: true, force: true });
}

function evictIfNeeded(): void {
  if (sessions.size < MAX_HLS_SESSIONS) return;
  const oldest = [...sessions.values()].sort((a, b) => {
    const aFinished = a.ffmpeg && a.ffmpeg.exitCode === null ? 1 : 0;
    const bFinished = b.ffmpeg && b.ffmpeg.exitCode === null ? 1 : 0;
    return aFinished - bFinished || a.lastAccessedAt - b.lastAccessedAt;
  })[0];
  if (oldest) {
    void removeSession(oldest).catch((error) => {
      console.warn(`[sabr] failed to evict ${oldest.videoId}:`, asError(error).message);
    });
  }
}

function createSession(videoId: string, result: ExtractResult): HlsSession {
  evictIfNeeded();

  const unique = `${videoId}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const directory = path.join(HLS_ROOT, unique);
  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  void ready.catch(() => undefined);

  const session: HlsSession = {
    videoId,
    directory,
    playlistPath: path.join(directory, HLS_PLAYLIST_NAME),
    ready,
    done: Promise.resolve(),
    resolveReady,
    rejectReady,
    readySettled: false,
    lastAccessedAt: Date.now(),
  };
  sessions.set(videoId, session);

  session.done = runSession(session, result).catch((error) => {
    const failure = asError(error);
    session.error = failure;
    settleReady(session, failure);
    console.error(`[sabr] ${videoId} HLS packaging failed:`, failure.message);
    throw failure;
  });
  // HLS requests await ready/done as appropriate; this guard prevents a
  // disconnected client from turning a background prewarm failure into an
  // unhandled rejection.
  void session.done.catch(() => undefined);

  return session;
}

export function prewarmHls(videoId: string, result: ExtractResult): void {
  if (!sessions.has(videoId)) createSession(videoId, result);
}

async function waitForAsset(
  session: HlsSession,
  assetName: string,
): Promise<HlsAsset> {
  session.lastAccessedAt = Date.now();
  if (assetName === HLS_PLAYLIST_NAME) {
    await session.ready;
  }

  const assetPath = path.join(session.directory, assetName);
  const deadline = Date.now() + 5_000;
  while (true) {
    if (session.error) throw session.error;
    try {
      const metadata = await stat(assetPath);
      if (!metadata.isFile()) throw new Error("Requested HLS asset is not a file");
      return {
        path: assetPath,
        size: metadata.size,
        contentType:
          assetName === HLS_PLAYLIST_NAME
            ? "application/vnd.apple.mpegurl"
            : "video/mp2t",
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      if (Date.now() >= deadline) {
        throw new Error(`HLS asset not found: ${assetName}`);
      }
      await delay(50);
    }
  }
}

export async function getHlsAsset(
  videoId: string,
  assetName: string,
  resolveResult: () => Promise<ExtractResult>,
): Promise<HlsAsset> {
  if (!HLS_ASSET_RE.test(assetName)) {
    throw new Error("Invalid HLS asset name");
  }

  let session = sessions.get(videoId);
  if (session?.error) {
    await removeSession(session);
    session = undefined;
  }
  if (!session) {
    const result = await resolveResult();
    if (!supportsSabr(result)) {
      throw new Error("SABR is not available for this video");
    }
    session = createSession(videoId, result);
  }

  return waitForAsset(session, assetName);
}

const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - HLS_SESSION_TTL_MS;
  for (const session of sessions.values()) {
    if (session.lastAccessedAt < cutoff) {
      void removeSession(session).catch((error) => {
        console.warn(`[sabr] failed to clean ${session.videoId}:`, asError(error).message);
      });
    }
  }
}, Math.min(HLS_SESSION_TTL_MS, 15 * 60 * 1000));
cleanupTimer.unref();
