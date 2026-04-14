import { randomBytes } from "crypto";
import type { Party, PublicParty, Song } from "./types";

// In-memory store. Roadmap: replace with Vercel KV / Supabase for real-time
// sync across regions and across cold starts. See README.
type GlobalStore = { parties: Map<string, Party> };
const g = globalThis as unknown as { __jukeboxStore?: GlobalStore };
if (!g.__jukeboxStore) {
  g.__jukeboxStore = { parties: new Map() };
}
const store = g.__jukeboxStore;

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

export function createParty(name: string): Party {
  let code = makeCode();
  // avoid collisions
  while (store.parties.has(code)) code = makeCode();
  const party: Party = {
    code,
    adminKey: makeAdminKey(),
    name: name.trim() || "The Party",
    createdAt: Date.now(),
    queue: [],
    nowPlaying: null,
    history: [],
  };
  store.parties.set(code, party);
  return party;
}

export function getParty(code: string): Party | null {
  return store.parties.get(code.toUpperCase()) ?? null;
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

export function sortQueue(queue: Song[]): Song[] {
  // Higher votes first, then FIFO (earliest addedAt first).
  return [...queue].sort((a, b) => {
    if (b.votes.length !== a.votes.length) return b.votes.length - a.votes.length;
    return a.addedAt - b.addedAt;
  });
}

export function addSong(
  code: string,
  input: {
    videoId: string;
    title: string;
    thumbnail: string;
    addedBy: string;
    addedByUserId: string;
  },
): { ok: true; song: Song } | { ok: false; error: string } {
  const party = getParty(code);
  if (!party) return { ok: false, error: "Party not found" };

  const already =
    party.queue.some((s) => s.videoId === input.videoId) ||
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

  // If nothing playing, promote immediately.
  if (!party.nowPlaying) {
    promoteNext(party);
  }
  return { ok: true, song };
}

export function voteSong(
  code: string,
  songId: string,
  userId: string,
): { ok: true; votes: number; voted: boolean } | { ok: false; error: string } {
  const party = getParty(code);
  if (!party) return { ok: false, error: "Party not found" };
  const song = party.queue.find((s) => s.id === songId);
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
  return { ok: true, votes: song.votes.length, voted };
}

export function removeSong(
  code: string,
  songId: string,
): { ok: true } | { ok: false; error: string } {
  const party = getParty(code);
  if (!party) return { ok: false, error: "Party not found" };
  const before = party.queue.length;
  party.queue = party.queue.filter((s) => s.id !== songId);
  if (party.queue.length === before) {
    return { ok: false, error: "Song not found" };
  }
  return { ok: true };
}

export function skipCurrent(
  code: string,
): { ok: true } | { ok: false; error: string } {
  const party = getParty(code);
  if (!party) return { ok: false, error: "Party not found" };
  if (party.nowPlaying) party.history.push(party.nowPlaying);
  party.nowPlaying = null;
  promoteNext(party);
  return { ok: true };
}

// Called when current song ends (by a viewer) — only advances if the currently
// playing song is still the one reported finished.
export function songEnded(
  code: string,
  videoId: string,
): { ok: true } | { ok: false; error: string } {
  const party = getParty(code);
  if (!party) return { ok: false, error: "Party not found" };
  if (!party.nowPlaying || party.nowPlaying.videoId !== videoId) {
    return { ok: true }; // already advanced by someone else
  }
  party.history.push(party.nowPlaying);
  party.nowPlaying = null;
  promoteNext(party);
  return { ok: true };
}

function promoteNext(party: Party) {
  if (party.nowPlaying) return;
  const sorted = sortQueue(party.queue);
  const next = sorted[0];
  if (!next) return;
  party.queue = party.queue.filter((s) => s.id !== next.id);
  party.nowPlaying = next;
}

export function verifyAdmin(code: string, key: string | null | undefined): boolean {
  if (!key) return false;
  const party = getParty(code);
  if (!party) return false;
  return timingSafeEqual(party.adminKey, key);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
