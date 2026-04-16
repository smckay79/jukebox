import { searchInnertube, type InnertubeResult } from "./innertube";

// "Automatch" a music video for a playlist import item. YouTube Music
// playlists often contain "- Topic" auto-audio entries (just album art);
// this swaps in the real music video when one exists. Deliberately
// conservative — we only surface a match if we're reasonably confident
// it's the same song, to avoid quietly queuing the wrong video.
//
// Uses the innertube endpoint so it costs zero Data-API quota regardless
// of how big the user's playlist is.

export interface MatchInput {
  videoId: string;
  title: string;
  channelTitle: string;
  durationSeconds?: number;
}

export interface MatchOutput {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  score: number;
}

const MIN_SCORE = 5;

export async function matchMusicVideo(
  input: MatchInput,
): Promise<MatchOutput | null> {
  const parsed = parseTrackTitle(input);
  if (!parsed.title) return null;

  // Items that already look like the official video (and aren't on a
  // "- Topic" auto-audio channel) are their own best match. Don't swap.
  if (
    looksLikeMusicVideo(input.title) &&
    !isTopicChannel(input.channelTitle)
  ) {
    return null;
  }

  const query = parsed.artist
    ? `${parsed.artist} ${parsed.title} official music video`
    : `${parsed.title} official music video`;

  let results: InnertubeResult[] = [];
  try {
    results = await searchInnertube(query, 8);
  } catch {
    return null;
  }

  let best: MatchOutput | null = null;
  for (const r of results) {
    // Don't suggest swapping to the same video we started from.
    if (r.videoId === input.videoId) continue;
    const score = scoreMatch(r, {
      song: parsed.title,
      artist: parsed.artist,
      durationSeconds: input.durationSeconds,
    });
    if (score < MIN_SCORE) continue;
    if (!best || score > best.score) {
      best = {
        videoId: r.videoId,
        title: r.title,
        channelTitle: r.channelTitle,
        thumbnail: r.thumbnail,
        duration: r.duration,
        durationSeconds: r.durationSeconds,
        score,
      };
    }
  }
  return best;
}

// ---------- parsing ----------

function parseTrackTitle(input: MatchInput): {
  title: string;
  artist?: string;
} {
  // Strip common annotations like "(Official Audio)" / "[Lyrics]" /
  // "(Visualizer)" so they don't bleed into the search query.
  const stripped = input.title
    .replace(
      /\s*[\[(]\s*[^\]\)]*(?:official|audio|lyric[s]?|visualizer|hd|hq|4k)[^\]\)]*[\])]/gi,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  // YouTube Music auto-audio entries live on "<Artist> - Topic" channels
  // with just the song name in the title.
  if (isTopicChannel(input.channelTitle)) {
    return {
      title: stripped,
      artist: input.channelTitle.replace(/\s*-\s*Topic$/i, "").trim(),
    };
  }

  // Very common "Artist - Song" pattern in regular YouTube titles. If the
  // split looks sensible (both sides non-empty, neither absurdly long),
  // use it; otherwise treat the whole title as the song and leave artist
  // unknown.
  const m = /^(.{1,60}?)\s+-\s+(.{1,80})$/.exec(stripped);
  if (m) {
    return { title: m[2].trim(), artist: m[1].trim() };
  }
  return { title: stripped };
}

function isTopicChannel(channel: string): boolean {
  return /\s-\s*Topic\s*$/i.test(channel);
}

function looksLikeMusicVideo(title: string): boolean {
  return /official\s+(music\s+)?video/i.test(title);
}

// ---------- scoring ----------

function scoreMatch(
  r: InnertubeResult,
  target: { song: string; artist?: string; durationSeconds?: number },
): number {
  const title = r.title.toLowerCase();
  const channel = r.channelTitle.toLowerCase();
  const song = target.song.toLowerCase();
  const artist = target.artist?.toLowerCase();

  let score = 0;

  // Title keywords — the whole point is to find the music-video upload,
  // so results that advertise that get a big boost.
  if (/official\s+(music\s+)?video/.test(title)) score += 4;
  else if (/\(official\)|\[official\]/.test(title)) score += 2;
  else if (/official\s+audio/.test(title)) score -= 1;

  // Reject outright-wrong versions unless we're desperate.
  if (/lyric(s)?\s+video/.test(title)) score -= 3;
  if (/\bcover\b|\bkaraoke\b|\binstrumental\b|\bremix\b|\breaction\b/.test(title)) {
    score -= 4;
  }
  if (/\blive\b|\bconcert\b|\bacoustic\b/.test(title) && !/official/.test(title)) {
    score -= 2;
  }

  // Song title present.
  if (song && title.includes(song)) score += 2;

  // Artist present, preferably as the uploader.
  if (artist) {
    if (channel.startsWith(artist) || channel === artist) score += 3;
    else if (channel.includes(artist)) score += 2;
    if (title.includes(artist)) score += 1;
    // If we're matching out of a Topic channel, another Topic channel is
    // a lateral move, not an upgrade — dock it.
    if (isTopicChannel(r.channelTitle)) score -= 2;
  }

  // Duration sanity — music videos usually sit close to the album edit.
  if (target.durationSeconds && r.durationSeconds) {
    const diff = Math.abs(target.durationSeconds - r.durationSeconds);
    if (diff <= 5) score += 3;
    else if (diff <= 15) score += 1;
    else if (diff > 60) score -= 3;
  }

  return score;
}
