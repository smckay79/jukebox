import { randomBytes } from "crypto";
import { getRedis } from "./kv";
import { publishPartyUpdate } from "./pubsub";
import type { Party, PublicParty, Song } from "./types";

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
    const g = globalThis as unknown as { __jukeboxMem?: Map<string, Party> };
    if (!g.__jukeboxMem) g.__jukeboxMem = new Map();
    this.store = g.__jukeboxMem;
  }
  async get(code: string) {
    return this.store.get(code) ?? null;
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
    return typeof raw === "string" ? (JSON.parse(raw) as Party) : raw;
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

export function toPublicParty(p: Party): PublicParty {
  return {
    code: p.code,
    name: p.name,
    createdAt: p.createdAt,
    queue: sortQueue(p.queue),
    nowPlaying: p.nowPlaying,
  };
}

function promoteNext(party: Party) {
  if (party.nowPlaying) return;
  const sorted = sortQueue(party.queue);
  const next = sorted[0];
  if (!next) return;
  party.queue = party.queue.filter((s) => s.id !== next.id);
  party.nowPlaying = next;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---------- public API ----------

export async function createParty(name: string): Promise<Party> {
  const s = storage();
  let code = makeCode();
  // collision-avoidance; probability is tiny, but be safe
  for (let i = 0; i < 5 && (await s.get(code)); i++) code = makeCode();

  const party: Party = {
    code,
    adminKey: makeAdminKey(),
    name: name.trim() || "The Party",
    createdAt: Date.now(),
    queue: [],
    nowPlaying: null,
    history: [],
  };
  await persist(party);
  return party;
}

export async function getParty(code: string): Promise<Party | null> {
  if (!code) return null;
  return storage().get(code.toUpperCase());
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
  };
  party.queue.push(song);
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

  if (party.nowPlaying) party.history.push(party.nowPlaying);
  party.nowPlaying = null;
  promoteNext(party);
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
  party.history.push(party.nowPlaying);
  party.nowPlaying = null;
  promoteNext(party);
  await persist(party);
  return { ok: true, party };
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
