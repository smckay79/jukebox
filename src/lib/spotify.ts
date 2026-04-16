// Minimal Spotify Web API client. We only need two things:
//   1. Public playlist metadata + tracks (Client Credentials flow, no
//      user auth). Works for public + unlisted playlists; private
//      playlists require per-user OAuth which isn't set up here.
//   2. A cached bearer token so we don't re-auth on every request.
//
// Enabled via env:
//   SPOTIFY_CLIENT_ID     — required
//   SPOTIFY_CLIENT_SECRET — required
//
// Without both, isSpotifyConfigured() returns false and /api/spotify/*
// short-circuit to 503 with a friendly message (same pattern as the
// YouTube Data API + Resend email wiring).

export interface SpotifyTrack {
  id: string; // Spotify track id (22 chars, base62)
  title: string; // song name
  artists: string[]; // primary + featured artists, in order
  album: string;
  durationSeconds: number;
  thumbnail: string; // album art — best-effort, may be empty
}

export interface SpotifyPlaylistPreview {
  playlistId: string;
  name: string;
  tracks: SpotifyTrack[];
}

export function isSpotifyConfigured(): boolean {
  return !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

// Parse a Spotify playlist URL or raw ID. Accepts:
//   - open.spotify.com/playlist/<id>?si=...
//   - spotify:playlist:<id>
//   - bare <id> (22+ base62 chars)
// Returns null for anything else (including user/album URIs) so the
// server can give a friendly "couldn't read that" message.
export function parseSpotifyPlaylistId(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  // spotify:playlist:<id>
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(s);
  if (uri) return uri[1];

  // open.spotify.com/playlist/<id>
  try {
    const u = new URL(s);
    if (/(^|\.)spotify\.com$/i.test(u.hostname)) {
      const m = /\/playlist\/([A-Za-z0-9]+)/.exec(u.pathname);
      if (m) return m[1];
    }
  } catch {
    /* not a URL — fall through */
  }

  // Bare ID
  if (/^[A-Za-z0-9]{16,}$/.test(s)) return s;

  return null;
}

// ---------- token cache ----------

interface CachedToken {
  token: string;
  // Epoch ms at which the token expires. We refresh a minute early to
  // avoid using an about-to-expire token mid-request.
  expiresAt: number;
}

function getCache(): { current: CachedToken | null } {
  const g = globalThis as unknown as { __spotifyTokenCache?: { current: CachedToken | null } };
  if (!g.__spotifyTokenCache) g.__spotifyTokenCache = { current: null };
  return g.__spotifyTokenCache;
}

async function getAccessToken(): Promise<string> {
  const cache = getCache();
  const now = Date.now();
  if (cache.current && cache.current.expiresAt - 60_000 > now) {
    return cache.current.token;
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Spotify credentials missing");
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[spotify] token exchange failed", res.status, body);
    throw new Error(`Spotify token exchange failed (${res.status})`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    token_type: string;
  };
  cache.current = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// ---------- playlist fetch ----------

// Cap on how many tracks we pull from one playlist. The YouTube-side
// cap is 100 and the party playlist setter caps at 100 items anyway, so
// matching that keeps behavior symmetric. Each /tracks request returns
// up to 100 items, so realistically this is a single API call.
const PLAYLIST_MAX_TRACKS = 100;

interface SpotifyPlaylistResponse {
  id?: string;
  name?: string;
  tracks?: SpotifyTracksPage;
}

interface SpotifyTracksPage {
  next?: string | null;
  items?: Array<{
    track?: {
      id?: string;
      name?: string;
      duration_ms?: number;
      is_local?: boolean;
      type?: string;
      album?: {
        name?: string;
        images?: Array<{ url?: string; width?: number; height?: number }>;
      };
      artists?: Array<{ name?: string }>;
    } | null;
  }>;
}

export async function fetchSpotifyPlaylist(
  playlistId: string,
): Promise<SpotifyPlaylistPreview | { error: string; status: number }> {
  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return { error: "Spotify isn't configured on this server", status: 503 };
  }

  const headers = { authorization: `Bearer ${token}` };

  // First page also gives us the playlist name + the first ~100 tracks.
  // Fetch without a `fields` filter — Spotify's field projection has
  // been unreliable with dot-notation and nested parentheses across API
  // versions, and the full playlist JSON (~100KB for 100 tracks) is
  // small enough that the bandwidth saving isn't worth the fragility.
  const metaRes = await fetch(
    `https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}`,
    { headers, cache: "no-store" },
  );
  if (!metaRes.ok) {
    // Log the full error body so operator-facing logs include the
    // Spotify reason (e.g. "Non existing id" vs "Insufficient client
    // scope"). The client still sees a friendly message.
    const body = await metaRes.text().catch(() => "");
    console.error(
      "[spotify] playlist fetch failed",
      metaRes.status,
      playlistId,
      body.slice(0, 300),
    );
    if (metaRes.status === 401) {
      // Invalidate the cached token so the next call refreshes it.
      getCache().current = null;
    }
    if (metaRes.status === 404) {
      return {
        error:
          "Couldn't find that Spotify playlist. It may be private, region-locked, or an editorial/algorithmic playlist that Spotify no longer exposes to third-party apps.",
        status: 400,
      };
    }
    if (metaRes.status === 403) {
      // Spotify added a rule (~2025) that the Spotify account that owns
      // the developer app must have an active Premium subscription,
      // otherwise every playlist-endpoint call 403s with this exact
      // message. Detect it and surface a specific fix-it note so the
      // host doesn't waste time checking playlist visibility.
      if (/premium subscription/i.test(body)) {
        return {
          error:
            "Spotify requires the developer account that owns this app to have an active Premium subscription. Upgrade the Spotify account that holds SPOTIFY_CLIENT_ID, or swap in credentials from a Premium account.",
          status: 400,
        };
      }
      return {
        error:
          "Spotify refused to open that playlist. Make sure it's public or unlisted — private and collaborative playlists aren't supported via the public API.",
        status: 400,
      };
    }
    return { error: "Spotify playlist lookup failed", status: 502 };
  }
  const meta = (await metaRes.json()) as SpotifyPlaylistResponse;
  const name = (meta.name ?? "").toString().slice(0, 200) || "Spotify playlist";

  const tracks: SpotifyTrack[] = [];
  const firstPage = meta.tracks;
  const rawCount = firstPage?.items?.length ?? 0;
  if (firstPage?.items) extractTracks(firstPage.items, tracks);
  console.log(
    "[spotify] playlist parsed",
    playlistId,
    `raw=${rawCount} usable=${tracks.length} next=${!!firstPage?.next}`,
  );

  // Paginate if there are more items and we're under the cap.
  let next: string | null | undefined = firstPage?.next ?? null;
  while (next && tracks.length < PLAYLIST_MAX_TRACKS) {
    const pageRes = await fetch(next, { headers, cache: "no-store" });
    if (!pageRes.ok) break; // partial result is better than none
    const page = (await pageRes.json()) as SpotifyTracksPage;
    if (page.items) extractTracks(page.items, tracks);
    next = page.next ?? null;
  }

  return {
    playlistId,
    name,
    tracks: tracks.slice(0, PLAYLIST_MAX_TRACKS),
  };
}

function extractTracks(
  items: NonNullable<SpotifyTracksPage["items"]>,
  out: SpotifyTrack[],
) {
  for (const it of items) {
    const t = it.track;
    if (!t) continue;
    // Skip podcast episodes, local files (no Spotify id + not playable
    // via the Web API), and deleted tracks.
    if (t.type && t.type !== "track") continue;
    if (t.is_local) continue;
    if (!t.id || !t.name) continue;

    const artists = (t.artists ?? [])
      .map((a) => (a.name ?? "").toString().trim())
      .filter(Boolean);
    const album = (t.album?.name ?? "").toString().slice(0, 200);
    const thumbnail = pickAlbumArt(t.album?.images);

    out.push({
      id: t.id,
      title: t.name.slice(0, 200),
      artists,
      album,
      durationSeconds: Math.round((t.duration_ms ?? 0) / 1000),
      thumbnail,
    });
  }
}

// Spotify returns album art in 3 sizes (640/300/64). Pick the
// medium-ish one; fall back to whatever is there.
function pickAlbumArt(
  images: Array<{ url?: string; width?: number; height?: number }> | undefined,
): string {
  if (!images || images.length === 0) return "";
  const sorted = images
    .filter((i): i is { url: string; width?: number; height?: number } => !!i.url)
    .sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  // Prefer the smallest image that's ≥160px wide (roughly mqdefault-size),
  // otherwise the largest.
  const mid = sorted.find((i) => (i.width ?? 0) >= 160);
  return (mid ?? sorted[sorted.length - 1] ?? sorted[0])?.url ?? "";
}
