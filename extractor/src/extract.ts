import { getSession, getVideoPoToken, invalidateSession } from "./innertube.js";

export type ExtractResult = {
  url: string;
  type: "mp4";
  quality: string;
  expiresAt: string | null;
};

export class VideoUnavailableError extends Error {}
export class ExtractionFailedError extends Error {}

function parseExpiry(url: string): string | null {
  try {
    const expireParam = new URL(url).searchParams.get("expire");
    if (!expireParam) return null;
    const seconds = Number(expireParam);
    if (!Number.isFinite(seconds)) return null;
    return new Date(seconds * 1000).toISOString();
  } catch {
    return null;
  }
}

// Auth-shaped failures (stale/rejected PO token) vs "video genuinely
// unavailable" need different handling — only the former should trigger a
// session refresh + retry. YouTube doesn't give us a clean error code here,
// so this is a best-effort string match against what youtubei.js/InnerTube
// actually say when a token's rejected.
function looksLikeAuthFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /sign in|login required|token|forbidden|401|403/i.test(msg);
}

async function extractOnce(videoId: string): Promise<ExtractResult> {
  const yt = await getSession();
  // Fresh, video-bound PO token for THIS call — see innertube.ts for why the
  // session-level (visitor-bound) token alone isn't enough here.
  const videoPoToken = await getVideoPoToken(videoId);
  const info = await yt.getInfo(videoId, { po_token: videoPoToken });

  if (info.playability_status && info.playability_status.status !== "OK") {
    throw new VideoUnavailableError(
      info.playability_status.reason || info.playability_status.status,
    );
  }

  const format = info.chooseFormat({ type: "video+audio", quality: "best" });
  if (!format) {
    throw new ExtractionFailedError("No combined video+audio format available");
  }

  // youtubei.js embeds a `pot=` (PO-token) param into the deciphered URL
  // from session.player.po_token specifically — a separate field from
  // session.po_token that Innertube.create() never populates for us (we
  // don't pass po_token at session-creation time). Without this, the
  // resulting URL is missing `pot=` entirely; ordinary videos don't seem to
  // enforce it, but stricter/licensed content's CDN edge rejects the byte
  // fetch outright — confirmed against real videos that failed exactly this
  // way. Use the fresh, video-bound token here too, for the same reason
  // it's used for the getInfo() call above.
  if (yt.session.player) {
    yt.session.player.po_token = videoPoToken;
  }
  const url = await format.decipher(yt.session.player);
  if (!url) {
    throw new ExtractionFailedError("Format deciphered to an empty URL");
  }

  return {
    url,
    type: "mp4",
    quality: format.quality_label ?? format.quality ?? "unknown",
    expiresAt: parseExpiry(url),
  };
}

export async function extractVideo(videoId: string): Promise<ExtractResult> {
  try {
    return await extractOnce(videoId);
  } catch (err) {
    if (err instanceof VideoUnavailableError) throw err;
    if (looksLikeAuthFailure(err)) {
      invalidateSession();
      return await extractOnce(videoId);
    }
    throw err;
  }
}
