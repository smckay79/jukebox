import { randomBytes } from "crypto";
import { getRedis } from "./kv";
import { publishPartyUpdate } from "./pubsub";
import type {
  BannedVideo,
  BumperVideo,
  Party,
  PartyPlaylist,
  PartyTheme,
  PlaylistTrack,
  PublicParty,
  Song,
  Sponsor,
  SponsorLabel,
  SubscriptionTier,
} from "./types";

// Cap on the per-party history ring buffer. Protects Redis from an
// overnight party pushing tens of thousands of entries into the JSON blob
// (which we load + rewrite on every mutation). Oldest entries drop off the
// front once we hit the cap.
const HISTORY_MAX = 200;

function pushHistory(party: Party, song: Song) {
  party.history.push(song);
  if (party.history.length > HISTORY_MAX) {
    party.history = party.history.slice(-HISTORY_MAX);
  }
}

// Seeded on every new party. Other bans get added live by the admin.
const DEFAULT_BANS: BannedVideo[] = [
  {
    videoId: "dQw4w9WgXcQ",
    title: "Rick Astley - Never Gonna Give You Up",
    thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    bannedAt: 0,
  },
];

// Legacy records (created before `banned` existed) need the field backfilled
// so every read after the upgrade returns a usable shape. Applied uniformly
// by both storage backends.
function normalizeParty(p: Party | (Party & { banned?: BannedVideo[]; adminPin?: string })): Party {
  if (!Array.isArray((p as Party).banned)) {
    (p as Party).banned = DEFAULT_BANS.slice();
  }
  if (!(p as Party).adminPin) {
    (p as Party).adminPin = makeAdminPin();
  }
  return p as Party;
}

// ---------- storage backends ----------

interface Storage {
  get(code: string): Promise<Party | null>;
  set(party: Party): Promise<void>;
  delete(code: string): Promise<void>;
}

// Fallback used in local dev when no KV creds are set. Works on a single
// warm Node process; will NOT survive serverless cold starts or scale
// across instances. For production use Redis.
class MemoryStorage implements Storage {
  private store: Map<string, Party>;

  constructor() {
    const g = globalThis as unknown as { __videojamMem?: Map<string, Party> };
    if (!g.__videojamMem) g.__videojamMem = new Map();
    this.store = g.__videojamMem;
  }
  async get(code: string) {
    const p = this.store.get(code);
    return p ? normalizeParty(p) : null;
  }
  async set(party: Party) {
    this.store.set(party.code, party);
  }
  async delete(code: string) {
    this.store.delete(code);
  }
}

class RedisStorage implements Storage {
  private redis = getRedis()!;
  private ttlSeconds = 60 * 60 * 24 * 7; // 7 days

  private key(code: string) {
    return `party:${code.toUpperCase()}`;
  }
  async get(code: string) {
    // Upstash auto-parses JSON values set as strings *or* objects.
    const raw = await this.redis.get<Party | string>(this.key(code));
    if (!raw) return null;
    const p = typeof raw === "string" ? (JSON.parse(raw) as Party) : raw;
    return normalizeParty(p);
  }
  async set(party: Party) {
    await this.redis.set(this.key(party.code), JSON.stringify(party), {
      ex: this.ttlSeconds,
    });
  }
  async delete(code: string) {
    await this.redis.del(this.key(code));
  }
}

let storageInstance: Storage | null = null;
function storage(): Storage {
  if (!storageInstance) {
    storageInstance = getRedis() ? new RedisStorage() : new MemoryStorage();
  }
  return storageInstance;
}

// Every successful write goes through this so live viewers (SSE subscribers)
// see updates without waiting for their safety-net poll.
async function persist(party: Party): Promise<void> {
  await storage().set(party);
  // Best-effort: publish failure is not fatal, the poll will fill the gap.
  await publishPartyUpdate(party.code, toPublicParty(party));
}

// ---------- helpers ----------

function makeCode(len = 6): string {
  // Unambiguous characters (no 0/O/1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function makeAdminKey(): string {
  return randomBytes(24).toString("base64url");
}

function makeAdminPin(): string {
  const n = randomBytes(2).readUInt16BE(0) % 10000;
  return n.toString().padStart(4, "0");
}

function makeId(): string {
  return randomBytes(8).toString("hex");
}

export function sortQueue(queue: Song[]): Song[] {
  // Higher votes first; ties broken by earliest addedAt (FIFO).
  return [...queue].sort((a, b) => {
    if (b.votes.length !== a.votes.length) {
      return b.votes.length - a.votes.length;
    }
    return a.addedAt - b.addedAt;
  });
}

const FREE_PARTY_LIMIT_MS = 60 * 60 * 1000;

export function toPublicParty(
  p: Party,
  hostTier?: SubscriptionTier,
): PublicParty {
  const unlimited = hostTier === "pro" || hostTier === "trial";
  const timeLimit =
    unlimited || hostTier === undefined
      ? undefined
      : {
          limitMs: FREE_PARTY_LIMIT_MS,
          expiresAt: p.createdAt + FREE_PARTY_LIMIT_MS,
          expired: Date.now() > p.createdAt + FREE_PARTY_LIMIT_MS,
        };
  return {
    code: p.code,
    name: p.name,
    createdAt: p.createdAt,
    queue: sortQueue(p.queue),
    nowPlaying: p.nowPlaying,
    banned: p.banned ?? [],
    theme: p.theme,
    marquee: p.marquee,
    hostTier,
    playlist: p.playlist
      ? { count: p.playlist.items.length, setAt: p.playlist.setAt }
      : undefined,
    bumpers: p.bumpers?.length ? { count: p.bumpers.length } : undefined,
    sponsors: p.sponsors,
    sponsorLabel: p.sponsorLabel,
    country: p.country,
    endedAt: p.endedAt,
    timeLimit,
  };
}

// Promote the next track into nowPlaying. User queue wins over the
// background playlist; within the user queue we pick highest-voted (ties
// by earliest addedAt). When the user queue is empty and a playlist is
// set, loop through its items — cursor advances as each playlist track
// leaves nowPlaying (see advanceOnLeaving below).
function makeBumperSong(pick: BumperVideo, now: number): Song {
  return {
    id: makeId(),
    videoId: pick.videoId,
    title: pick.title,
    thumbnail: pick.thumbnail,
    addedBy: "Bumper",
    addedByUserId: "__bumper",
    addedAt: now,
    votes: [],
    source: "bumper",
    startedAt: now,
  };
}

function promoteNext(party: Party, prevSource?: string) {
  if (party.nowPlaying) return;
  const now = Date.now();
  const bumpers = party.bumpers ?? [];

  if (prevSource !== "bumper" && bumpers.length > 0) {
    // Peek at what the next song would be to check match-triggered bumpers.
    const sorted = sortQueue(party.queue);
    const upcoming = sorted[0];
    if (upcoming) {
      const titleLower = upcoming.title.toLowerCase();
      const matched = bumpers.filter(
        (b) =>
          b.triggerType === "match" &&
          b.triggerMatch &&
          titleLower.includes(b.triggerMatch.toLowerCase()),
      );
      if (matched.length > 0) {
        const pick = matched[Math.floor(Math.random() * matched.length)];
        party.nowPlaying = makeBumperSong(pick, now);
        return;
      }
    }

    // Random bumpers — ~30% chance between any songs.
    const randoms = bumpers.filter((b) => !b.triggerType || b.triggerType === "random");
    if (randoms.length > 0 && Math.random() < 0.3) {
      const pick = randoms[Math.floor(Math.random() * randoms.length)];
      party.nowPlaying = makeBumperSong(pick, now);
      return;
    }
  }

  const sorted = sortQueue(party.queue);
  const next = sorted[0];
  if (next) {
    party.queue = party.queue.filter((s) => s.id !== next.id);
    party.nowPlaying = { ...next, startedAt: now };
    return;
  }
  // No user songs — pull from the background playlist if one is set.
  const pl = party.playlist;
  if (!pl || pl.items.length === 0) return;
  const banned = new Set(party.banned.map((b) => b.videoId));
  for (let tries = 0; tries < pl.items.length; tries++) {
    const idx = ((pl.cursor % pl.items.length) + pl.items.length) % pl.items.length;
    const track = pl.items[idx];
    pl.cursor = idx + 1;
    if (banned.has(track.videoId)) continue;
    party.nowPlaying = {
      id: makeId(),
      videoId: track.videoId,
      title: track.title,
      thumbnail: track.thumbnail,
      addedBy: "Party playlist",
      addedByUserId: "__playlist",
      addedAt: now,
      votes: [],
      source: "playlist",
      startedAt: now,
    };
    return;
  }
}

// Finalize the nowPlaying entry before it's archived into history:
// compute playedSeconds from startedAt, cap to a sane upper bound so a
// tab that was left paused for 9 hours doesn't log a 9-hour duration.
const MAX_PLAYED_SECONDS = 3 * 60 * 60; // 3h — longer than any reasonable track
function finalizePlayed(song: Song): Song {
  if (!song.startedAt) return song;
  const elapsed = Math.max(0, Math.floor((Date.now() - song.startedAt) / 1000));
  const capped = Math.min(elapsed, MAX_PLAYED_SECONDS);
  return { ...song, playedSeconds: capped };
}

// Returns true if the currently-playing track is a background-playlist
// promotion — i.e. safe to interrupt and skip logging to history.
function isPlaylistTrack(s: Song | null | undefined): boolean {
  return !!s && s.source === "playlist";
}

function isInterstitial(s: Song | null | undefined): boolean {
  return !!s && (s.source === "playlist" || s.source === "bumper");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- public API ----------

export async function createParty(
  name: string,
  hostUserId?: string,
  theme?: PartyTheme,
): Promise<Party> {
  const s = storage();
  let code = makeCode();
  for (let i = 0; i < 5 && (await s.get(code)); i++) code = makeCode();

  const party: Party = {
    code,
    adminKey: makeAdminKey(),
    adminPin: makeAdminPin(),
    name: name.trim() || "The Party",
    createdAt: Date.now(),
    hostUserId,
    queue: [],
    nowPlaying: null,
    history: [],
    banned: DEFAULT_BANS.slice(),
    theme,
  };
  await persist(party);
  await addPartyToIndex(party.code);
  if (hostUserId) {
    await addPartyToUserHistory(hostUserId, party);
  }
  return party;
}


export async function getParty(code: string): Promise<Party | null> {
  if (!code) return null;
  return storage().get(code.toUpperCase());
}

// Resolve the host's subscription tier for a party. Returns "free" for
// anonymous hosts (no account) so the 1-hour limit applies.
export async function getHostTier(
  party: Party,
): Promise<SubscriptionTier> {
  if (!party.hostUserId) return "free";
  // Lazy-import to avoid a circular dep (users → kv ← store).
  const { getUser } = await import("./users");
  const { getSubscriptionInfo } = await import("./subscription");
  const user = await getUser(party.hostUserId);
  if (!user) return "free";
  return getSubscriptionInfo(user).tier;
}

export async function addSong(
  code: string,
  input: {
    videoId: string;
    title: string;
    thumbnail: string;
    addedBy: string;
    addedByUserId: string;
  },
): Promise<
  { ok: true; song: Song; party: Party } | { ok: false; error: string }
> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (party.endedAt) {
    return { ok: false, error: "This party has ended" };
  }

  if (party.banned.some((b) => b.videoId === input.videoId)) {
    return { ok: false, error: "That song has been banned from this party" };
  }

  const already =
    party.queue.some((x) => x.videoId === input.videoId) ||
    party.nowPlaying?.videoId === input.videoId;
  if (already) return { ok: false, error: "That song is already in the queue" };

  const song: Song = {
    id: makeId(),
    videoId: input.videoId,
    title: input.title,
    thumbnail: input.thumbnail,
    addedBy: input.addedBy.trim() || "Anonymous",
    addedByUserId: input.addedByUserId,
    addedAt: Date.now(),
    votes: [input.addedByUserId], // adding implies upvote
    source: "user",
  };
  party.queue.push(song);
  // Interrupt a background/bumper track the moment a real user song
  // arrives — the user expects their pick to start right away.
  if (isInterstitial(party.nowPlaying)) {
    party.nowPlaying = null;
  }
  if (!party.nowPlaying) promoteNext(party);
  await persist(party);
  return { ok: true, song, party };
}

export async function voteSong(
  code: string,
  songId: string,
  userId: string,
): Promise<
  | { ok: true; votes: number; voted: boolean; party: Party }
  | { ok: false; error: string }
> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  const song = party.queue.find((x) => x.id === songId);
  if (!song) return { ok: false, error: "Song not in queue" };

  const idx = song.votes.indexOf(userId);
  let voted: boolean;
  if (idx === -1) {
    song.votes.push(userId);
    voted = true;
  } else {
    song.votes.splice(idx, 1);
    voted = false;
  }
  await persist(party);
  return { ok: true, votes: song.votes.length, voted, party };
}

const DOWNVOTE_THRESHOLD = 3;
const DOWNVOTE_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
const DOWNVOTE_MAX_PER_WINDOW = 3;

const downvoteHistory = new Map<string, number[]>();

function canUserDownvote(partyCode: string, userId: string): boolean {
  const key = `${partyCode}:${userId}`;
  const times = downvoteHistory.get(key) ?? [];
  const cutoff = Date.now() - DOWNVOTE_COOLDOWN_MS;
  const recent = times.filter((t) => t > cutoff);
  downvoteHistory.set(key, recent);
  return recent.length < DOWNVOTE_MAX_PER_WINDOW;
}

function recordDownvote(partyCode: string, userId: string) {
  const key = `${partyCode}:${userId}`;
  const times = downvoteHistory.get(key) ?? [];
  times.push(Date.now());
  downvoteHistory.set(key, times);
}

export async function downvoteNowPlaying(
  code: string,
  userId: string,
  isHost = false,
): Promise<
  | { ok: true; downvotes: number; skipped: boolean; goldenSkip: boolean; party: Party }
  | { ok: false; error: string }
> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (!party.nowPlaying) return { ok: false, error: "Nothing playing" };

  // Host golden downvote: mark the song and broadcast so all screens
  // show the golden X. The actual skip happens when the client calls
  // POST /ended after the animation completes.
  if (isHost) {
    party.nowPlaying.goldenSkip = true;
    if (!party.nowPlaying.downvotes) party.nowPlaying.downvotes = [];
    await persist(party);
    return { ok: true, downvotes: party.nowPlaying.downvotes.length, skipped: false, goldenSkip: true, party };
  }

  if (!canUserDownvote(code.toUpperCase(), userId)) {
    return { ok: false, error: "You've used your skips for now — try again later" };
  }

  if (!party.nowPlaying.downvotes) party.nowPlaying.downvotes = [];
  if (party.nowPlaying.downvotes.includes(userId)) {
    return { ok: false, error: "You already voted to skip this song" };
  }

  party.nowPlaying.downvotes.push(userId);
  recordDownvote(code.toUpperCase(), userId);

  let skipped = false;
  if (party.nowPlaying.downvotes.length >= DOWNVOTE_THRESHOLD) {
    const skippedSong = party.nowPlaying;
    const prevSource = party.nowPlaying.source;
    if (!isInterstitial(party.nowPlaying)) {
      pushHistory(party, finalizePlayed(party.nowPlaying));
    }
    party.nowPlaying = null;

    // Try to insert a global skip-bumper before advancing the queue.
    // Only fires when the skipped song wasn't itself a bumper.
    if (prevSource !== "bumper") {
      try {
        const { pickRandomSkipBumper } = await import("./skip-bumpers");
        const pick = await pickRandomSkipBumper();
        if (pick) {
          const now = Date.now();
          party.nowPlaying = makeBumperSong(
            { videoId: pick.videoId, title: pick.title, thumbnail: pick.thumbnail },
            now,
          );
        }
      } catch {
        /* skip-bumper lookup failed — fall through to normal queue */
      }
    }
    if (!party.nowPlaying) {
      promoteNext(party, prevSource);
    }

    skipped = true;
    // Fire-and-forget: log to the system-wide flagged videos list.
    import("./flagged").then(({ recordCrowdSkip }) =>
      recordCrowdSkip(
        skippedSong.videoId,
        skippedSong.title,
        skippedSong.thumbnail,
        code.toUpperCase(),
      ).catch(() => {}),
    );
  }

  await persist(party);
  return {
    ok: true,
    downvotes: skipped ? 0 : (party.nowPlaying?.downvotes?.length ?? 0),
    skipped,
    goldenSkip: false,
    party,
  };
}

export async function removeSong(
  code: string,
  songId: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  const before = party.queue.length;
  party.queue = party.queue.filter((x) => x.id !== songId);
  if (party.queue.length === before) {
    return { ok: false, error: "Song not found" };
  }
  await persist(party);
  return { ok: true, party };
}

export async function skipCurrent(
  code: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  const prevSource = party.nowPlaying?.source;
  if (party.nowPlaying && !isInterstitial(party.nowPlaying)) {
    pushHistory(party, finalizePlayed(party.nowPlaying));
  }
  party.nowPlaying = null;
  promoteNext(party, prevSource);
  await persist(party);
  return { ok: true, party };
}

// Called when a viewer's player signals the current song has ended.
// Idempotent: if another instance already advanced, this is a no-op.
export async function songEnded(
  code: string,
  videoId: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (!party.nowPlaying || party.nowPlaying.videoId !== videoId) {
    return { ok: true, party };
  }
  const wasGoldenSkip = !!party.nowPlaying.goldenSkip;
  const prevSource = party.nowPlaying.source;
  if (!isInterstitial(party.nowPlaying)) {
    pushHistory(party, finalizePlayed(party.nowPlaying));
  }
  party.nowPlaying = null;

  // Golden skip gets the same skip-bumper treatment as crowd-skip.
  if (wasGoldenSkip && prevSource !== "bumper") {
    try {
      const { pickRandomSkipBumper } = await import("./skip-bumpers");
      const pick = await pickRandomSkipBumper();
      if (pick) {
        party.nowPlaying = makeBumperSong(
          { videoId: pick.videoId, title: pick.title, thumbnail: pick.thumbnail },
          Date.now(),
        );
      }
    } catch {
      /* fall through to normal queue */
    }
  }
  if (!party.nowPlaying) {
    promoteNext(party, prevSource);
  }

  await persist(party);
  return { ok: true, party };
}

// Adds the video to the party's ban list (idempotent), and cleans it out of
// the queue / nowPlaying so it stops playing immediately.
export async function banVideo(
  code: string,
  input: { videoId: string; title: string; thumbnail: string },
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  if (!party.banned.some((b) => b.videoId === input.videoId)) {
    party.banned.unshift({
      videoId: input.videoId,
      title: input.title.slice(0, 200) || "Banned video",
      thumbnail:
        input.thumbnail ||
        `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
      bannedAt: Date.now(),
    });
  }

  party.queue = party.queue.filter((x) => x.videoId !== input.videoId);
  if (party.nowPlaying?.videoId === input.videoId) {
    party.nowPlaying = null;
    promoteNext(party);
  }

  await persist(party);
  return { ok: true, party };
}

export async function unbanVideo(
  code: string,
  videoId: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  const before = party.banned.length;
  party.banned = party.banned.filter((b) => b.videoId !== videoId);
  if (party.banned.length === before) {
    return { ok: false, error: "Not in ban list" };
  }
  await persist(party);
  return { ok: true, party };
}

// Passing `null` clears the theme. Custom images are expected to be
// already-resized data URLs; we cap stored length to keep Redis values sane.
const MAX_THEME_IMAGE_LEN = 600_000; // ~450KB base64 → ~340KB binary

export async function setTheme(
  code: string,
  theme: PartyTheme | null,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  if (theme === null) {
    party.theme = undefined;
  } else {
    const clean: PartyTheme = {};
    if (typeof theme.era === "string" && theme.era) {
      clean.era = theme.era.slice(0, 20);
    }
    if (typeof theme.genre === "string" && theme.genre) {
      clean.genre = theme.genre.slice(0, 20);
    }
    if (typeof theme.seed === "number" && Number.isFinite(theme.seed)) {
      clean.seed = Math.floor(theme.seed);
    }
    if (typeof theme.customImage === "string" && theme.customImage) {
      if (theme.customImage.length > MAX_THEME_IMAGE_LEN) {
        return { ok: false, error: "Image is too large — try a smaller file." };
      }
      if (!theme.customImage.startsWith("data:image/")) {
        return { ok: false, error: "Unsupported image" };
      }
      clean.customImage = theme.customImage;
    }
    party.theme = clean;
  }

  await persist(party);
  return { ok: true, party };
}

// Empty/whitespace-only input clears the marquee. We cap length so an
// overenthusiastic host can't paste a novel onto the TV.
const MAX_MARQUEE_LEN = 300;

export async function setMarquee(
  code: string,
  text: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  const clean = (text ?? "").toString().trim().slice(0, MAX_MARQUEE_LEN);
  party.marquee = clean || undefined;
  await persist(party);
  return { ok: true, party };
}

// Replace the party's background playlist wholesale. Caps at 100 items to
// match the import route's PLAYLIST_MAX. If something's currently playing
// as a background track, keep it going — the new playlist will pick up
// from cursor 0 once the current loop track ends.
const PLAYLIST_MAX = 100;

export async function setPartyPlaylist(
  code: string,
  items: PlaylistTrack[],
): Promise<{ ok: true; party: Party; count: number } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  const clean: PlaylistTrack[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const vid = (it.videoId ?? "").toString().trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
    if (seen.has(vid)) continue;
    seen.add(vid);
    clean.push({
      videoId: vid,
      title: (it.title || "YouTube video").toString().slice(0, 200),
      thumbnail:
        (it.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`)
          .toString()
          .slice(0, 500),
    });
    if (clean.length >= PLAYLIST_MAX) break;
  }

  if (clean.length === 0) {
    return { ok: false, error: "No valid videos in playlist" };
  }

  party.playlist = { items: clean, cursor: 0, setAt: Date.now() };
  // If nothing is playing right now, start the playlist immediately so the
  // host sees feedback that it took effect.
  if (!party.nowPlaying) promoteNext(party);
  await persist(party);
  return { ok: true, party, count: clean.length };
}

export async function clearPartyPlaylist(
  code: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  party.playlist = undefined;
  // Stop a background track that's currently playing — once the playlist
  // is cleared there's no queue of loop items, so we just drop out to the
  // user queue (or silence).
  if (isPlaylistTrack(party.nowPlaying)) {
    party.nowPlaying = null;
    promoteNext(party);
  }
  await persist(party);
  return { ok: true, party };
}

// ---------- bumper videos ----------

export async function addBumper(
  code: string,
  input: {
    videoId: string;
    title: string;
    thumbnail: string;
    triggerType?: "random" | "match";
    triggerMatch?: string;
  },
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (!party.bumpers) party.bumpers = [];
  if (party.bumpers.some((b) => b.videoId === input.videoId)) {
    return { ok: true, party };
  }
  const triggerType = input.triggerType === "match" ? "match" : "random";
  party.bumpers.push({
    videoId: input.videoId,
    title: input.title.slice(0, 200) || "Bumper",
    thumbnail:
      input.thumbnail ||
      `https://i.ytimg.com/vi/${input.videoId}/hqdefault.jpg`,
    triggerType,
    triggerMatch:
      triggerType === "match"
        ? (input.triggerMatch ?? "").slice(0, 100) || undefined
        : undefined,
  });
  await persist(party);
  return { ok: true, party };
}

export async function removeBumper(
  code: string,
  videoId: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  party.bumpers = (party.bumpers ?? []).filter((b) => b.videoId !== videoId);
  await persist(party);
  return { ok: true, party };
}

export async function getBumpers(
  code: string,
): Promise<BumperVideo[]> {
  const party = await storage().get(code.toUpperCase());
  return party?.bumpers ?? [];
}

// ---------- sponsors ----------

export async function addSponsor(
  code: string,
  input: {
    imageUrl: string;
    title?: string;
  },
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (!party.sponsors) party.sponsors = [];

  // Cap at 10 sponsors
  if (party.sponsors.length >= 10) {
    return { ok: false, error: "Maximum 10 sponsors allowed" };
  }

  // Validate imageUrl (should be a data URL or valid URL)
  // Cap at ~6.7MB (5MB file + base64 encoding overhead ~33%)
  const url = input.imageUrl.trim();
  if (!url) {
    return { ok: false, error: "No image provided" };
  }
  if (url.length > 6700000) {
    return { ok: false, error: "Image too large (max 5MB)" };
  }

  party.sponsors.push({
    id: makeId(),
    imageUrl: url,
    title: (input.title ?? "").slice(0, 100) || undefined,
    addedAt: Date.now(),
  });
  await persist(party);
  return { ok: true, party };
}

export async function removeSponsor(
  code: string,
  sponsorId: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  party.sponsors = (party.sponsors ?? []).filter((sp) => sp.id !== sponsorId);
  await persist(party);
  return { ok: true, party };
}

export async function getSponsors(code: string): Promise<Sponsor[]> {
  const party = await storage().get(code.toUpperCase());
  return party?.sponsors ?? [];
}

export async function setSponsorLabel(
  code: string,
  input: SponsorLabel,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };

  const label: SponsorLabel = {};
  if (typeof input.text === "string") label.text = input.text.slice(0, 40);
  if (typeof input.color === "string") {
    const clean = input.color.trim();
    // Accept #rgb / #rrggbb only; ignore anything else.
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(clean)) label.color = clean;
  }
  if (typeof input.brightness === "number" && !Number.isNaN(input.brightness)) {
    label.brightness = Math.max(0, Math.min(100, Math.round(input.brightness)));
  }

  party.sponsorLabel = label;
  await persist(party);
  return { ok: true, party };
}

export async function clearSponsors(
  code: string,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  party.sponsors = [];
  await persist(party);
  return { ok: true, party };
}

// Pass `null` (or an empty string) to clear and fall back to auto-detection.
// Anything else must be ISO 3166-1 alpha-2 — two letters, no digits — or we
// reject. We don't validate against a specific list because YouTube may add
// new regionCodes over time; the admin picker bounds the practical set.
export async function setCountry(
  code: string,
  country: string | null,
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (country === null || country === "") {
    party.country = undefined;
  } else {
    const clean = country.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(clean)) {
      return { ok: false, error: "Country must be a 2-letter code" };
    }
    party.country = clean;
  }
  await persist(party);
  return { ok: true, party };
}

// Returns the played-songs history, newest first. Capped at HISTORY_MAX by
// pushHistory, so the response stays small. The caller is responsible for
// any admin-gating — this function doesn't check.
export async function getPartyHistory(code: string): Promise<Song[] | null> {
  const party = await storage().get(code.toUpperCase());
  if (!party) return null;
  return [...party.history].reverse();
}

// Idempotent: calling endParty twice just returns the already-ended state.
// Clears nowPlaying / queue / background-playlist so any still-open
// client tabs stop looping, and flags `endedAt` so new writes bounce.
// The currently-playing song (if any) gets finalized into history first
// so its playedSeconds is captured in the recap.
export async function endParty(
  code: string,
): Promise<{ ok: true; party: Party; alreadyEnded: boolean } | { ok: false; error: string }> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return { ok: false, error: "Party not found" };
  if (party.endedAt) {
    return { ok: true, party, alreadyEnded: true };
  }
  if (party.nowPlaying && !isInterstitial(party.nowPlaying)) {
    pushHistory(party, finalizePlayed(party.nowPlaying));
  }
  party.nowPlaying = null;
  party.queue = [];
  party.playlist = undefined;
  party.endedAt = Date.now();
  await persist(party);
  return { ok: true, party, alreadyEnded: false };
}

// Record the recap-delivery side-effects onto the Party record so a
// post-end reload can still display them. Partial writes are fine —
// each field is independently optional.
export async function recordRecapDelivery(
  code: string,
  update: {
    emailSent?: boolean;
    emailTo?: string;
    savedPlaylist?: { id: string; name: string; count: number };
  },
): Promise<void> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return;
  if (update.emailSent !== undefined) party.recapEmailSent = update.emailSent;
  if (update.emailTo !== undefined) party.recapEmailTo = update.emailTo;
  if (update.savedPlaylist !== undefined) {
    party.recapSavedPlaylist = update.savedPlaylist;
  }
  // Internal flags — no SSE publish needed.
  await s.set(party);
}

export async function verifyAdmin(
  code: string,
  key: string | null | undefined,
): Promise<boolean> {
  if (!key) return false;
  const party = await storage().get(code.toUpperCase());
  if (!party) return false;
  return timingSafeEqual(party.adminKey, key);
}

export async function verifyPin(
  code: string,
  pin: string | null | undefined,
): Promise<string | null> {
  if (!pin) return null;
  const party = await storage().get(code.toUpperCase());
  if (!party) return null;
  if (!party.adminPin) return null;
  if (!timingSafeEqual(party.adminPin, pin)) return null;
  return party.adminKey;
}

// ---------- party index (for admin portal) ----------

async function addPartyToIndex(code: string): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.sadd("all_party_codes", code.toUpperCase());
    return;
  }
  const g = globalThis as unknown as { __videojamPartyIndex?: Set<string> };
  if (!g.__videojamPartyIndex) g.__videojamPartyIndex = new Set();
  g.__videojamPartyIndex.add(code.toUpperCase());
}

// ---------- user party history ----------

export interface PartySnapshot {
  code: string;
  name: string;
  createdAt: number;
  endedAt?: number;
  theme?: PartyTheme;
  bumpers?: BumperVideo[];
  marquee?: string;
  playlist?: PartyPlaylist;
  country?: string;
}

async function addPartyToUserHistory(userId: string, party: Party): Promise<void> {
  const r = getRedis();
  const snapshot: PartySnapshot = {
    code: party.code,
    name: party.name,
    createdAt: party.createdAt,
    theme: party.theme,
    bumpers: party.bumpers,
    marquee: party.marquee,
    playlist: party.playlist,
    country: party.country,
  };

  if (r) {
    const key = `user:parties:${userId}`;
    // Get existing history
    const existing = await r.get<PartySnapshot[]>(key);
    const parties = (Array.isArray(existing) ? existing : []) as PartySnapshot[];
    // Add new party at the front
    parties.unshift(snapshot);
    // Keep only the last 50 parties
    if (parties.length > 50) parties.splice(50);
    // Store back
    await r.set(key, JSON.stringify(parties));
    return;
  }

  // In-memory fallback for development
  const g = globalThis as unknown as {
    __videojamUserParties?: Map<string, PartySnapshot[]>;
  };
  if (!g.__videojamUserParties) g.__videojamUserParties = new Map();
  const parties = g.__videojamUserParties.get(userId) ?? [];
  parties.unshift(snapshot);
  // Keep only the last 50
  if (parties.length > 50) parties.pop();
  g.__videojamUserParties.set(userId, parties);
}

export async function getUserPartyHistory(userId: string): Promise<PartySnapshot[]> {
  const r = getRedis();
  if (r) {
    const key = `user:parties:${userId}`;
    const existing = await r.get<PartySnapshot[] | string>(key);
    if (!existing) return [];
    try {
      const parsed = typeof existing === "string" ? JSON.parse(existing) : existing;
      return Array.isArray(parsed) ? (parsed as PartySnapshot[]) : [];
    } catch {
      return [];
    }
  }

  const g = globalThis as unknown as {
    __videojamUserParties?: Map<string, PartySnapshot[]>;
  };
  return g.__videojamUserParties?.get(userId) ?? [];
}

export async function deletePartyFromHistory(
  userId: string,
  partyCode: string,
): Promise<boolean> {
  const r = getRedis();
  if (r) {
    const key = `user:parties:${userId}`;
    const existing = await r.get<PartySnapshot[] | string>(key);
    if (!existing) return false;
    try {
      const parsed = typeof existing === "string" ? JSON.parse(existing) : existing;
      const parties = (Array.isArray(parsed) ? parsed : []) as PartySnapshot[];
      const filtered = parties.filter((p) => p.code !== partyCode);
      if (filtered.length === parties.length) return false; // Not found
      if (filtered.length === 0) {
        await r.del(key);
      } else {
        await r.set(key, JSON.stringify(filtered));
      }
      return true;
    } catch {
      return false;
    }
  }

  const g = globalThis as unknown as {
    __videojamUserParties?: Map<string, PartySnapshot[]>;
  };
  const parties = g.__videojamUserParties?.get(userId);
  if (!parties) return false;
  const idx = parties.findIndex((p) => p.code === partyCode);
  if (idx === -1) return false;
  parties.splice(idx, 1);
  if (parties.length === 0) {
    g.__videojamUserParties?.delete(userId);
  }
  return true;
}

export async function restorePartySettings(
  code: string,
  snapshot: PartySnapshot,
): Promise<Party | null> {
  const s = storage();
  const party = await s.get(code.toUpperCase());
  if (!party) return null;

  // Restore theme
  if (snapshot.theme) {
    party.theme = snapshot.theme;
  }

  // Restore bumpers
  if (snapshot.bumpers && snapshot.bumpers.length > 0) {
    party.bumpers = snapshot.bumpers;
  }

  // Restore marquee
  if (snapshot.marquee) {
    party.marquee = snapshot.marquee;
  }

  // Restore playlist
  if (snapshot.playlist) {
    party.playlist = { ...snapshot.playlist, cursor: 0 };
  }

  // Restore country
  if (snapshot.country) {
    party.country = snapshot.country;
  }

  await persist(party);
  return party;
}

export async function listAllPartyCodes(): Promise<string[]> {
  const r = getRedis();
  if (r) {
    const codes = await r.smembers("all_party_codes");
    return codes as string[];
  }
  const g = globalThis as unknown as {
    __videojamMem?: Map<string, Party>;
    __videojamPartyIndex?: Set<string>;
  };
  const fromMap = g.__videojamMem ? Array.from(g.__videojamMem.keys()) : [];
  const fromIndex = g.__videojamPartyIndex
    ? Array.from(g.__videojamPartyIndex)
    : [];
  return Array.from(new Set([...fromMap, ...fromIndex]));
}

export async function getAllParties(): Promise<Party[]> {
  const codes = await listAllPartyCodes();
  const s = storage();
  const parties: Party[] = [];
  for (const code of codes) {
    const p = await s.get(code);
    if (p) parties.push(p);
  }
  return parties;
}
