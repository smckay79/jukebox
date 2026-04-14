// Shared, no-API-key search via YouTube's public innertube endpoint — the
// same one the youtube.com web client uses. No quota. Unofficial, so
// response shape is subject to change.
//
// Two callers:
//   - /api/search as a fallback when the Data API is out of quota.
//   - /api/youtube/match for upgrading playlist audio-only tracks to their
//     music-video counterparts (free of quota pressure by design).

export interface InnertubeResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
}

// The public API key baked into YouTube's web client. Visible in any
// devtools request; it authorizes only the innertube endpoint.
const INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const INNERTUBE_CLIENT_VERSION = "2.20241212.01.00";
// `params` filters the result set. "EgIQAQ%3D%3D" = videos only (not
// channels, playlists, or shorts-only mixes).
const INNERTUBE_VIDEOS_ONLY = "EgIQAQ%3D%3D";

export async function searchInnertube(
  query: string,
  limit = 8,
): Promise<InnertubeResult[]> {
  const res = await fetch(
    `https://www.youtube.com/youtubei/v1/search?prettyPrint=false&key=${INNERTUBE_KEY}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: INNERTUBE_CLIENT_VERSION,
            hl: "en",
            gl: "US",
          },
        },
        query,
        params: INNERTUBE_VIDEOS_ONLY,
      }),
    },
  );
  if (!res.ok) throw new Error(`innertube HTTP ${res.status}`);
  const data = (await res.json()) as InnertubeSearchResponse;
  return parseInnertubeResults(data).slice(0, limit);
}

interface InnertubeRuns {
  runs?: Array<{ text?: string }>;
  simpleText?: string;
}
interface InnertubeThumbnail {
  url?: string;
  width?: number;
  height?: number;
}
interface InnertubeVideoRenderer {
  videoId?: string;
  title?: InnertubeRuns;
  longBylineText?: InnertubeRuns;
  ownerText?: InnertubeRuns;
  shortBylineText?: InnertubeRuns;
  lengthText?: InnertubeRuns;
  thumbnail?: { thumbnails?: InnertubeThumbnail[] };
}
interface InnertubeSearchResponse {
  contents?: unknown;
}

function readRuns(r: InnertubeRuns | undefined): string {
  if (!r) return "";
  if (r.simpleText) return r.simpleText;
  if (r.runs) return r.runs.map((x) => x.text ?? "").join("");
  return "";
}

// Walk the nested `contents` tree and collect every videoRenderer we find.
// Innertube changes the exact shape from time to time; recursion keeps us
// robust to extra wrapping renderers like shelfRenderer.
function collectVideoRenderers(
  node: unknown,
  out: InnertubeVideoRenderer[],
): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  if (obj.videoRenderer) {
    out.push(obj.videoRenderer as InnertubeVideoRenderer);
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) {
      for (const x of v) collectVideoRenderers(x, out);
    } else if (v && typeof v === "object") {
      collectVideoRenderers(v, out);
    }
  }
}

function parseInnertubeResults(
  data: InnertubeSearchResponse,
): InnertubeResult[] {
  const renderers: InnertubeVideoRenderer[] = [];
  collectVideoRenderers(data.contents, renderers);
  const out: InnertubeResult[] = [];
  for (const v of renderers) {
    const id = v.videoId;
    if (!id) continue;
    const title = readRuns(v.title);
    if (!title) continue;
    const channel = readRuns(
      v.longBylineText ?? v.ownerText ?? v.shortBylineText,
    );
    const durStr = readRuns(v.lengthText);
    const seconds = parseClockDuration(durStr);
    const thumbs = v.thumbnail?.thumbnails ?? [];
    const pick =
      thumbs.find((t) => (t.width ?? 0) >= 320 && (t.width ?? 0) <= 360) ??
      thumbs[thumbs.length - 1] ??
      { url: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
    out.push({
      videoId: id,
      title,
      channelTitle: channel,
      thumbnail: pick.url ?? `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      duration: durStr || undefined,
      durationSeconds: seconds || undefined,
    });
  }
  return out;
}

// "3:45" / "1:23:45" → seconds. Returns 0 for unparseable input (e.g. live).
function parseClockDuration(s: string): number {
  if (!s) return 0;
  const parts = s.split(":").map((x) => parseInt(x, 10));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}
