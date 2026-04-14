import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// YouTube Data API `search.list` costs 100 quota units; `videos.list` costs 1.
// Free daily quota is 10,000 → ~99 searches/day untrimmed. A small in-memory
// cache keeps repeated queries cheap during a single party.
const cache = new Map<string, { at: number; data: SearchResult[] }>();
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
}

export async function GET(req: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Search not configured" },
      { status: 503 },
    );
  }

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

  try {
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&type=video&maxResults=8&safeSearch=none` +
      `&q=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
    const sr = await fetch(searchUrl, { cache: "no-store" });
    if (!sr.ok) {
      // Surface Google's reason so the host can see whether it's quota
      // exhaustion (common on the free tier — resets at midnight Pacific),
      // a disabled/unauthorized key, or an HTTP-referrer restriction that
      // doesn't match this deployment.
      const detail = await readGoogleError(sr);
      console.error("[search] youtube search failed", {
        status: sr.status,
        reason: detail.reason,
        message: detail.message,
      });
      return NextResponse.json(
        {
          error: friendlySearchError(detail.reason) ?? "YouTube search failed",
          reason: detail.reason,
        },
        { status: detail.reason === "quotaExceeded" ? 429 : 502 },
      );
    }
    const sd = (await sr.json()) as { items?: YTSearchItem[] };
    const items = sd.items ?? [];
    const ids = items
      .map((it) => it.id?.videoId)
      .filter((x): x is string => !!x);

    // Enrich with durations in a single cheap call.
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
        // Non-fatal: UI just won't show durations. Still log so a totally
        // dead key is visible in the server output.
        const detail = await readGoogleError(vr);
        console.error("[search] youtube videos.list failed", {
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

    // Boost "Official Video" / "Official Music Video" over everything else,
    // then "Official Audio", then plain "Official". Stable within ties so
    // YouTube's own relevance order is preserved for same-score results.
    const ranked = results
      .map((r, i) => ({ r, i, s: officialBoost(r.title) }))
      .sort((a, b) => (b.s - a.s) || (a.i - b.i))
      .map(({ r }) => r);

    if (cache.size > CACHE_MAX) {
      // Drop the oldest half in one pass; good enough LRU for our scale.
      const entries = [...cache.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      );
      for (let i = 0; i < Math.floor(CACHE_MAX / 2); i++) {
        cache.delete(entries[i][0]);
      }
    }
    return NextResponse.json({ results: ranked });
  } catch (err) {
    console.error("[search] unexpected error", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

// Google's error envelope is `{ error: { code, message, errors: [{ reason }] }}`.
// We pull out the first reason (e.g. "quotaExceeded", "keyInvalid",
// "ipRefererBlocked", "accessNotConfigured") plus a short human message so
// the server log shows what broke without dumping the whole payload.
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

// Map the most common Google reasons to a message the host can actually act
// on. Everything else falls through to the generic "YouTube search failed".
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

// Scoring: official-video always wins, then official-audio, then plain
// "official". Lyric videos go below plain to push them down without hiding.
function officialBoost(title: string): number {
  const t = title.toLowerCase();
  if (/official\s+(music\s+)?video/.test(t)) return 3;
  if (/\(official\)|\[official\]/.test(t)) return 2;
  if (/official\s+audio/.test(t)) return 2;
  if (/\bofficial\b/.test(t)) return 1;
  if (/lyric(s)?\s+video|lyric\s+video/.test(t)) return -1;
  return 0;
}

// ---------- helpers ----------

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

// "PT3M45S" / "PT1H2M3S" → seconds. Returns 0 for unparseable input.
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
