import { NextResponse } from "next/server";
import { searchInnertube, type InnertubeResult } from "@/lib/innertube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// YouTube search flow:
//   1) If a YOUTUBE_API_KEY is configured, try the official Data API first
//      (best results quality + duration metadata + music category filter).
//      `search.list` is 100 quota units so 10k default tier = ~99 searches/day;
//      each `videos.list` is 1.
//   2) On quotaExceeded / keyInvalid / etc., or if no key is set at all,
//      fall through to YouTube's own public web-client "innertube" search
//      endpoint. No key, no quota — but unofficial and could change without
//      notice. Acceptable as a fallback; not as the primary.
//   3) Short in-memory cache keyed by CACHE_VERSION keeps repeats cheap;
//      bump CACHE_VERSION whenever ranking logic changes so stale shapes
//      don't hang around after a deploy.
//
// When the Data API reports quota exhaustion we remember it for
// QUOTA_COOLDOWN_MS so we don't keep hitting a wall Google has already said
// is up.
//
// Tuning intent: bias the whole pipeline toward the real music video for a
// song. Category 10 on the Data API, shorts filtered out by duration,
// reuploads/karaoke/lyric-videos/covers penalized in scoring, and verified-
// artist uploads (from innertube badges) boosted hard.

const CACHE_VERSION = 2; // bump when ranking changes to invalidate old cache
const cache = new Map<string, { at: number; data: SearchResult[] }>();
const CACHE_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;

const QUOTA_COOLDOWN_MS = 15 * 60 * 1000;
let quotaExhaustedUntil = 0;

// Shorts polluting music results: YT Music never has <60s entries, so we
// drop anything that short regardless of what the query implied.
const MIN_MUSIC_SECONDS = 60;

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  verifiedArtist?: boolean;
}

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });
  if (q.length > 100) {
    return NextResponse.json({ error: "Query too long" }, { status: 400 });
  }

  // Bias toward music-video results: when the user typed a short free-form
  // query without any music-intent keywords (title like "mr. brightside"),
  // silently append "official music video" before asking YouTube. Longer
  // queries and anything that already mentions video/audio/cover/karaoke
  // etc. go through untouched so the user stays in control.
  const apiQuery = augmentMusicQuery(q);

  const ck = `${CACHE_VERSION}:${apiQuery.toLowerCase()}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json({ results: hit.data });
  }

  const key = process.env.YOUTUBE_API_KEY;
  let results: SearchResult[] | null = null;
  let source: "data-api" | "innertube" = "data-api";

  // ---- 1) Official Data API (if we have a key and aren't in cooldown) ----
  if (key && Date.now() >= quotaExhaustedUntil) {
    const dataApi = await searchViaDataApi(apiQuery, key);
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
      results = await searchViaInnertube(apiQuery);
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

  // ---- 3) Filter + rank + cache + respond ----
  // Drop shorts (YT Music never has <60s entries) and live-stream-looking
  // rows with no parseable length — those end up as 0s.
  const filtered = results.filter((r) => {
    const s = r.durationSeconds ?? 0;
    if (s > 0 && s < MIN_MUSIC_SECONDS) return false;
    return true;
  });

  const intent = detectIntent(q);
  const ranked = filtered
    .map((r, i) => ({ r, i, s: scoreMusicResult(r, intent) }))
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
    // videoCategoryId=10 = Music category. videoEmbeddable=true tells
    // YouTube to pre-filter out videos that can't play in a third-party
    // iframe — saves us manually dropping them after the fact. Both
    // filters are type=video only, so we spell that out explicitly.
    const searchUrl =
      `https://www.googleapis.com/youtube/v3/search` +
      `?part=snippet&type=video&maxResults=10&safeSearch=none` +
      `&videoCategoryId=10&videoEmbeddable=true` +
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
    // Even with videoEmbeddable=true above, belt-and-suspenders: the
    // embed status can drift between search.list and videos.list (rare,
    // but we've seen it). Pull `status` so we can drop stragglers and
    // also grab `contentDetails` for duration in the same call (1 quota
    // unit total).
    const nonEmbeddable = new Set<string>();
    if (ids.length > 0) {
      const videosUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?part=contentDetails,status&id=${ids.join(",")}` +
        `&key=${encodeURIComponent(key)}`;
      const vr = await fetch(videosUrl, { cache: "no-store" });
      if (vr.ok) {
        const vd = (await vr.json()) as { items?: YTVideoItem[] };
        for (const v of vd.items ?? []) {
          const iso = v.contentDetails?.duration ?? "";
          const s = parseISODuration(iso);
          if (v.id) {
            durationById.set(v.id, { seconds: s, formatted: fmt(s) });
            if (v.status?.embeddable === false) nonEmbeddable.add(v.id);
          }
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
        if (nonEmbeddable.has(id)) return null;
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
// endpoint and the playlist matcher share it. Thin adapter that carries
// over the verifiedArtist signal so the ranker can use it.
async function searchViaInnertube(q: string): Promise<SearchResult[]> {
  const results = await searchInnertube(q, 10);
  return results.map(
    (r: InnertubeResult): SearchResult => ({
      videoId: r.videoId,
      title: r.title,
      channelTitle: r.channelTitle,
      thumbnail: r.thumbnail,
      duration: r.duration,
      durationSeconds: r.durationSeconds,
      verifiedArtist: r.verifiedArtist,
    }),
  );
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

// Words that signal the user explicitly wants something off the music-video
// golden path — if the query mentions "live" we shouldn't penalize live
// versions in the results, and so on.
const INTENT_MARKERS = [
  "cover",
  "covers",
  "karaoke",
  "instrumental",
  "remix",
  "remixes",
  "reaction",
  "lyric",
  "lyrics",
  "live",
  "concert",
  "acoustic",
  "piano",
  "audio",
  "8d",
  "nightcore",
  "slowed",
  "reverb",
];
const MUSIC_INTENT_MARKERS = [
  ...INTENT_MARKERS,
  "video",
  "music",
  "official",
  "mv",
];

interface QueryIntent {
  rawLower: string;
  wantsCover: boolean;
  wantsKaraoke: boolean;
  wantsInstrumental: boolean;
  wantsRemix: boolean;
  wantsReaction: boolean;
  wantsLyric: boolean;
  wantsLive: boolean;
  wantsAcoustic: boolean;
  wantsAudio: boolean;
  wantsEffect: boolean; // 8d / nightcore / slowed / reverb
}

function detectIntent(q: string): QueryIntent {
  const s = q.toLowerCase();
  const has = (re: RegExp) => re.test(s);
  return {
    rawLower: s,
    wantsCover: has(/\bcovers?\b/),
    wantsKaraoke: has(/\bkaraoke\b/),
    wantsInstrumental: has(/\binstrumental\b/),
    wantsRemix: has(/\bremix(es)?\b/),
    wantsReaction: has(/\breaction\b/),
    wantsLyric: has(/\blyrics?\b/),
    wantsLive: has(/\blive\b|\bconcert\b/),
    wantsAcoustic: has(/\bacoustic\b|\bpiano\b/),
    wantsAudio: has(/\baudio\b/),
    wantsEffect: has(/\b8d\b|\bnightcore\b|\bslowed\b|\breverb\b/),
  };
}

// If the query is a short free-form song title with no music-intent marker,
// nudge YouTube toward the music-video result by appending the phrase
// server-side. We only augment when it's almost certain to help (short
// query, none of the disambiguation words present).
function augmentMusicQuery(q: string): string {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return q;
  const s = q.toLowerCase();
  for (const m of MUSIC_INTENT_MARKERS) {
    if (s.includes(m)) return q;
  }
  return `${q} official music video`;
}

// Rank a single result. Positive = more likely to be the "real" music
// video for the song the user typed; negative = probably a reupload,
// cover, karaoke, reaction, lyric-only, etc. We don't reject low scorers
// — the sort is stable so worst-case they end up at the bottom instead
// of being hidden.
function scoreMusicResult(r: SearchResult, intent: QueryIntent): number {
  const t = r.title.toLowerCase();
  const ch = r.channelTitle.toLowerCase();
  let s = 0;

  // Strongest signal: YouTube-verified artist channel. Overrides most
  // title-word nitpicks.
  if (r.verifiedArtist) s += 8;

  // Title keywords calling out the canonical music video.
  if (/official\s+music\s+video/.test(t)) s += 5;
  else if (/\bofficial\s+video\b|\(official\)|\[official\]/.test(t)) s += 3;
  else if (/\bofficial\b/.test(t)) s += 1;
  if (/official\s+audio/.test(t) && !intent.wantsAudio) s -= 1;

  // Reupload / fan-content penalties. Skip the penalty if the user
  // actually asked for that variant.
  if (!intent.wantsLyric && /\blyric(s)?\s+video\b|\blyric\s+video\b/.test(t)) s -= 4;
  if (!intent.wantsCover && /\bcover(ed)?\b/.test(t)) s -= 4;
  if (!intent.wantsKaraoke && /\bkaraoke\b/.test(t)) s -= 5;
  if (!intent.wantsInstrumental && /\binstrumental\b/.test(t)) s -= 3;
  if (!intent.wantsRemix && /\bremix\b/.test(t)) s -= 3;
  if (!intent.wantsReaction && /\breaction\b|\breacts\s+to\b/.test(t)) s -= 5;
  if (
    !intent.wantsEffect &&
    /\b8d\b|\bnightcore\b|\bslowed\s*(?:\+|and)?\s*reverb\b|\bsped\s*up\b/.test(
      t,
    )
  ) {
    s -= 4;
  }
  if (!intent.wantsLive && /\blive\b|\bconcert\b/.test(t) && !/official/.test(t)) {
    s -= 2;
  }
  if (
    !intent.wantsAcoustic &&
    /\bacoustic\b|\bpiano\s+cover\b/.test(t)
  ) {
    s -= 2;
  }
  if (/\b(?:full\s+)?(?:album|playlist|mix|megamix|compilation|mashup)\b/.test(t)) {
    s -= 3;
  }

  // "- Topic" channels are YouTube Music's auto-generated album-audio
  // uploads. They're legit music, just not the music video the user
  // probably wants. Lateral move, not an upgrade.
  if (/\s-\s*topic\s*$/i.test(r.channelTitle)) s -= 2;

  // Duration sanity: typical pop single is 2:30-5:00. Penalize very long
  // entries (interview mixes, compilations) unless the user asked.
  const d = r.durationSeconds ?? 0;
  if (d > 0 && d < MIN_MUSIC_SECONDS) s -= 5; // already filtered, defensive
  else if (
    d > 15 * 60 &&
    !intent.wantsLive &&
    !/\bmix\b|\bcompilation\b/.test(intent.rawLower)
  ) {
    s -= 3;
  }

  // Channel-name hints the upload is fan-made.
  if (/\btopic\b|\blyrics?\b|\bkaraoke\b|\bcover\b|\breaction\b/.test(ch)) {
    s -= 1;
  }

  return s;
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
  status?: { embeddable?: boolean };
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
