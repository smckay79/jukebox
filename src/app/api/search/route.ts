import { NextResponse } from "next/server";
import { searchInnertube, type InnertubeResult } from "@/lib/innertube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// YouTube search flow:
//   1) If a YOUTUBE_API_KEY is configured, try the official Data API first
//      (best results quality + duration metadata). `search.list` is 100 quota
//      units so 10k default tier = ~99 searches/day; each `videos.list` is 1.
//   2) On quotaExceeded / keyInvalid / etc., or if no key is set at all,
//      fall through to YouTube's own public web-client "innertube" search
//      endpoint. No key, no quota — but unofficial and could change without
//      notice. Acceptable as a fallback; not as the primary.
//   3) Short in-memory cache keeps repeats cheap either way.
//
// When the Data API reports quota exhaustion we remember it for
// QUOTA_COOLDOWN_MS so we don't keep hitting a wall Google has already said
// is up.

const cache = new Map<string, { at: number; data: SearchResult[] }>();
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let quotaExhaustedUntil = 0;

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });
  if (q.length > 100) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  const ck = q.toLowerCase();
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ results: hit.data });
  }

  const key = process.env.YOUTUBE_API_KEY;
  let results: SearchResult[] | null = null;
  let source: "data-api" | "innertube" = "data-api";

  // ---- 1) Official Data API (if we have a key and aren't in cooldown) ----
  if (key && Date.now() >= quotaExhaustedUntil) {
    const dataApi = await searchViaDataApi(q, key);
    if (dataApi.ok) {
      results = dataApi.results;
    } else if (dataApi.fallbackable) {
      // quotaExceeded / keyInvalid / accessNotConfigured / etc. — fall
      // through to innertube silently. The host sees search keep working;
      // the server logs carry the detail.
      if (
        dataApi.reason === "quotaExceeded" ||
        dataApi.reason === "dailyLimitExceeded"
      ) {
        quotaExhaustedUntil = Date.now() + QUOTA_COOLDOWN_MS;
      }
      source = "innertube";
    } else {
      // Non-fallbackable (e.g. our own bug, unexpected HTTP 500): return the
      // friendly message and don't poke innertube.
      return NextResponse.json(
        {
          error:
            friendlySearchError(dataApi.reason) ?? "YouTube search failed",
          reason: dataApi.reason,
        },
        { status: dataApi.reason === "quotaExceeded" ? 429 : 502 },
      );
    }
  } else {
    source = "innertube";
  }

  // ---- 2) InnerTube fallback ----
  if (!results) {
    try {
      results = await searchViaInnertube(q);
    } catch (err) {
      console.error("[search] innertube fallback failed", err);
      return NextResponse.json(
        {
          error:
            key && quotaExhaustedUntil > Date.now()
              ? "YouTube search is out of daily quota — try pasting a link until tomorrow."
              : "Search failed — try pasting a link instead.",
        },
        { status: 502 },
      );
    }
  }

  // ---- 3) Rank + cache + respond ----
  const ranked = results
    .map((r, i) => ({ r, i, s: officialBoost(r.title) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ r }) => r);

  if (cache.size > CACHE_MAX) {
    const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
    for (let i = 0; i < Math.floor(CACHE_MAX / 2); i++) {
      cache.delete(entries[i][0]);
    }
  }
  cache.set(ck, { at: Date.now(), data: ranked });

  return NextResponse.json({ results: ranked, source });
}

// ---------- Data API path ----------

type DataApiOutcome =
  | { ok: true; results: SearchResult[] }
  | { ok: false; fallbackable: boolean; reason: string | null };

async function searchViaDataApi(
  q: string,
  key: string,
): Promise<DataApiOutcome> {
  try {
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&type=video&maxResults=8&safeSearch=none` +
      `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
    const sr = await fetch(searchUrl, { cache: "no-store" });
    if (!sr.ok) {
      const detail = await readGoogleError(sr);
      console.error("[search] data api search.list failed", {
        status: sr.status,
        reason: detail.reason,
        message: detail.message,
      });
      return {
        ok: false,
        fallbackable: isFallbackableReason(detail.reason),
        reason: detail.reason,
      };
    }
    const sd = (await sr.json()) as { items?: YTSearchItem[] };
    const items = sd.items ?? [];
    const ids = items
      .map((it) => it.id?.videoId)
      .filter((x): x is string => !!x);

    const durationById = new Map<
      string,
      { seconds: number; formatted: string }
    >();
    if (ids.length > 0) {
      const videosUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=contentDetails&id=${ids.join(",")}` +
        `&key=${encodeURIComponent(key)}`;
      const vr = await fetch(videosUrl, { cache: "no-store" });
      if (vr.ok) {
        const vd = (await vr.json()) as { items?: YTVideoItem[] };
        for (const v of vd.items ?? []) {
          const iso = v.contentDetails?.duration ?? "";
          const s = parseISODuration(iso);
          if (v.id) durationById.set(v.id, { seconds: s, formatted: fmt(s) });
        }
      } else {
        const detail = await readGoogleError(vr);
        console.error("[search] data api videos.list failed", {
          status: vr.status,
          reason: detail.reason,
          message: detail.message,
        });
      }
    }

    const results: SearchResult[] = items
      .map((it): SearchResult | null => {
        const id = it.id?.videoId;
        if (!id) return null;
        const sn = it.snippet ?? {};
        const thumb =
          sn.thumbnails?.medium?.url ??
          sn.thumbnails?.default?.url ??
          `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;
        const d = durationById.get(id);
        return {
          videoId: id,
          title: decodeEntities(sn.title ?? "YouTube video"),
          channelTitle: decodeEntities(sn.channelTitle ?? ""),
          thumbnail: thumb,
          duration: d?.formatted,
          durationSeconds: d?.seconds,
        };
      })
      .filter((x): x is SearchResult => x !== null);
    return { ok: true, results };
  } catch (err) {
    console.error("[search] data api threw", err);
    return { ok: false, fallbackable: true, reason: null };
  }
}

// InnerTube fallback is delegated to src/lib/innertube.ts — both the search
// endpoint and the playlist matcher share it. We only need a thin adapter.
async function searchViaInnertube(q: string): Promise<SearchResult[]> {
  const results = await searchInnertube(q, 8);
  return results.map((r: InnertubeResult) => ({ ...r }));
}

// ---------- shared helpers ----------

async function readGoogleError(
  res: Response,
): Promise<{ reason: string | null; message: string }> {
  try {
    const body = (await res.json()) as {
      error?: {
        message?: string;
        errors?: Array<{ reason?: string; message?: string }>;
      };
    };
    const e = body.error ?? {};
    const first = e.errors?.[0];
    return {
      reason: first?.reason ?? null,
      message: e.message ?? first?.message ?? `HTTP ${res.status}`,
    };
  } catch {
    return { reason: null, message: `HTTP ${res.status}` };
  }
}

// Reasons we're comfortable silently falling back on — they all mean "the
// Data API won't answer us right now" rather than "the user asked for
// something nonsensical".
function isFallbackableReason(reason: string | null): boolean {
  if (!reason) return true;
  return [
    "quotaExceeded",
    "dailyLimitExceeded",
    "rateLimitExceeded",
    "userRateLimitExceeded",
    "keyInvalid",
    "keyExpired",
    "keyRevoked",
    "accessNotConfigured",
    "ipRefererBlocked",
    "forbidden",
    "backendError",
    "internalError",
  ].includes(reason);
}

function friendlySearchError(reason: string | null): string | null {
  switch (reason) {
    case "quotaExceeded":
    case "dailyLimitExceeded":
    case "rateLimitExceeded":
    case "userRateLimitExceeded":
      return "YouTube search is out of daily quota — try pasting a link until tomorrow.";
    case "keyInvalid":
    case "keyExpired":
    case "keyRevoked":
    case "badRequest":
      return "Search key is invalid. Paste YouTube links directly for now.";
    case "accessNotConfigured":
      return "YouTube Data API isn't enabled for this key.";
    case "ipRefererBlocked":
      return "Search key's referrer restrictions don't allow this site.";
    default:
      return null;
  }
}

function officialBoost(title: string): number {
  const t = title.toLowerCase();
  if (/official\s+(music\s+)?video/.test(t)) return 3;
  if (/\(official\)|\[official\]/.test(t)) return 2;
  if (/official\s+audio/.test(t)) return 2;
  if (/\bofficial\b/.test(t)) return 1;
  if (/lyric(s)?\s+video|lyric\s+video/.test(t)) return -1;
  return 0;
}

interface YTSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
    };
  };
}

interface YTVideoItem {
  id?: string;
  contentDetails?: { duration?: string };
}

function parseISODuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const s = parseInt(m[3] ?? "0", 10);
  return h * 3600 + min * 60 + s;
}

function fmt(total: number): string {
  if (total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
