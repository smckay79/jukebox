import { randomBytes } from "crypto";
import { getRedis } from "./kv";
import type {
  PlaylistTrack,
  SavedPlaylist,
  SavedPlaylistSummary,
  User,
} from "./types";

// User + saved-playlist storage. Mirrors the Memory/Redis split used by
// `store.ts` so the app boots without Upstash creds (dev) and still picks
// up Redis transparently in prod.
//
// Key layout:
//   user:<id>              → User JSON
//   user:<id>:playlists    → Set<string> of playlist IDs owned by the user
//   playlist:<id>          → SavedPlaylist JSON (includes ownerId)

const PLAYLIST_MAX_ITEMS = 200; // plenty for a party loop
const PLAYLIST_MAX_NAME = 80;
const PLAYLISTS_PER_USER = 50; // don't let a single account hoard storage

// ---------- storage backends ----------

interface Storage {
  // users
  getUser(id: string): Promise<User | null>;
  setUser(u: User): Promise<void>;
  // playlists
  getPlaylist(id: string): Promise<SavedPlaylist | null>;
  setPlaylist(p: SavedPlaylist): Promise<void>;
  deletePlaylist(id: string, ownerId: string): Promise<void>;
  listUserPlaylistIds(ownerId: string): Promise<string[]>;
  addUserPlaylistId(ownerId: string, id: string): Promise<void>;
}

class MemoryStorage implements Storage {
  private users: Map<string, User>;
  private playlists: Map<string, SavedPlaylist>;
  private byOwner: Map<string, Set<string>>;
  constructor() {
    const g = globalThis as unknown as {
      __videojamUsers?: Map<string, User>;
      __videojamPlaylists?: Map<string, SavedPlaylist>;
      __videojamByOwner?: Map<string, Set<string>>;
    };
    if (!g.__videojamUsers) g.__videojamUsers = new Map();
    if (!g.__videojamPlaylists) g.__videojamPlaylists = new Map();
    if (!g.__videojamByOwner) g.__videojamByOwner = new Map();
    this.users = g.__videojamUsers;
    this.playlists = g.__videojamPlaylists;
    this.byOwner = g.__videojamByOwner;
  }
  async getUser(id: string) {
    return this.users.get(id) ?? null;
  }
  async setUser(u: User) {
    this.users.set(u.id, u);
  }
  async getPlaylist(id: string) {
    return this.playlists.get(id) ?? null;
  }
  async setPlaylist(p: SavedPlaylist) {
    this.playlists.set(p.id, p);
  }
  async deletePlaylist(id: string, ownerId: string) {
    this.playlists.delete(id);
    this.byOwner.get(ownerId)?.delete(id);
  }
  async listUserPlaylistIds(ownerId: string) {
    return Array.from(this.byOwner.get(ownerId) ?? []);
  }
  async addUserPlaylistId(ownerId: string, id: string) {
    let s = this.byOwner.get(ownerId);
    if (!s) {
      s = new Set();
      this.byOwner.set(ownerId, s);
    }
    s.add(id);
  }
}

class RedisStorage implements Storage {
  private redis = getRedis()!;
  private userKey(id: string) {
    return `user:${id}`;
  }
  private playlistKey(id: string) {
    return `playlist:${id}`;
  }
  private ownerIndexKey(id: string) {
    return `user:${id}:playlists`;
  }
  async getUser(id: string) {
    const raw = await this.redis.get<User | string>(this.userKey(id));
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as User) : raw;
  }
  async setUser(u: User) {
    await this.redis.set(this.userKey(u.id), JSON.stringify(u));
  }
  async getPlaylist(id: string) {
    const raw = await this.redis.get<SavedPlaylist | string>(
      this.playlistKey(id),
    );
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as SavedPlaylist) : raw;
  }
  async setPlaylist(p: SavedPlaylist) {
    await this.redis.set(this.playlistKey(p.id), JSON.stringify(p));
  }
  async deletePlaylist(id: string, ownerId: string) {
    await this.redis.del(this.playlistKey(id));
    await this.redis.srem(this.ownerIndexKey(ownerId), id);
  }
  async listUserPlaylistIds(ownerId: string) {
    const ids = await this.redis.smembers(this.ownerIndexKey(ownerId));
    return ids as string[];
  }
  async addUserPlaylistId(ownerId: string, id: string) {
    await this.redis.sadd(this.ownerIndexKey(ownerId), id);
  }
}

let storageInstance: Storage | null = null;
function storage(): Storage {
  if (!storageInstance) {
    storageInstance = getRedis() ? new RedisStorage() : new MemoryStorage();
  }
  return storageInstance;
}

// ---------- users ----------

export async function getUser(id: string): Promise<User | null> {
  return storage().getUser(id);
}

// Called on every successful Google sign-in. Creates the user on first
// login; on subsequent logins we refresh the profile fields in case the
// user changed their display name / picture in Google.
export async function upsertUserFromGoogle(claims: {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}): Promise<User> {
  const now = Date.now();
  const existing = await storage().getUser(claims.sub);
  const user: User = {
    id: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
    createdAt: existing?.createdAt ?? now,
    lastLoginAt: now,
    subscriptionPaidUntil: existing?.subscriptionPaidUntil,
    subscriptionOverride: existing?.subscriptionOverride,
    subscriptionSource: existing?.subscriptionSource,
    stripeCustomerId: existing?.stripeCustomerId,
    stripeSubscriptionId: existing?.stripeSubscriptionId,
  };
  await storage().setUser(user);
  await addUserToIndex(user.id);
  return user;
}

// ---------- user index (for admin portal) ----------

async function addUserToIndex(id: string): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.sadd("all_user_ids", id);
    return;
  }
  const g = globalThis as unknown as { __videojamUserIndex?: Set<string> };
  if (!g.__videojamUserIndex) g.__videojamUserIndex = new Set();
  g.__videojamUserIndex.add(id);
}

export async function getAllUsers(): Promise<User[]> {
  const r = getRedis();
  let ids: string[];
  if (r) {
    ids = (await r.smembers("all_user_ids")) as string[];
  } else {
    const g = globalThis as unknown as {
      __videojamUsers?: Map<string, User>;
      __videojamUserIndex?: Set<string>;
    };
    const fromMap = g.__videojamUsers ? Array.from(g.__videojamUsers.keys()) : [];
    const fromIndex = g.__videojamUserIndex
      ? Array.from(g.__videojamUserIndex)
      : [];
    ids = Array.from(new Set([...fromMap, ...fromIndex]));
  }
  const users: User[] = [];
  for (const id of ids) {
    const u = await storage().getUser(id);
    if (u) users.push(u);
  }
  return users;
}

export async function countAllUsers(): Promise<number> {
  const r = getRedis();
  if (r) {
    const n = await r.scard("all_user_ids");
    return typeof n === "number" ? n : 0;
  }
  const g = globalThis as unknown as {
    __videojamUsers?: Map<string, User>;
  };
  return g.__videojamUsers?.size ?? 0;
}

export async function updateUserSubscription(
  userId: string,
  update: {
    subscriptionPaidUntil?: number;
    subscriptionOverride?: "pro" | "none" | undefined;
    subscriptionSource?: "admin" | "stripe" | undefined;
  },
): Promise<User | null> {
  const user = await storage().getUser(userId);
  if (!user) return null;
  if ("subscriptionPaidUntil" in update) user.subscriptionPaidUntil = update.subscriptionPaidUntil;
  user.subscriptionOverride = update.subscriptionOverride;
  user.subscriptionSource = update.subscriptionSource;
  await storage().setUser(user);
  return user;
}

export async function getUserByStripeCustomerId(
  customerId: string,
): Promise<User | null> {
  const all = await getAllUsers();
  return all.find((u) => u.stripeCustomerId === customerId) ?? null;
}

export async function updateUserStripeFields(
  userId: string,
  fields: {
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    subscriptionPaidUntil?: number;
    subscriptionSource?: "admin" | "stripe" | undefined;
  },
): Promise<User | null> {
  const user = await storage().getUser(userId);
  if (!user) return null;
  if (fields.stripeCustomerId !== undefined) user.stripeCustomerId = fields.stripeCustomerId;
  if (fields.stripeSubscriptionId !== undefined) user.stripeSubscriptionId = fields.stripeSubscriptionId;
  if (fields.subscriptionPaidUntil !== undefined) user.subscriptionPaidUntil = fields.subscriptionPaidUntil;
  if (fields.subscriptionSource !== undefined) user.subscriptionSource = fields.subscriptionSource;
  await storage().setUser(user);
  return user;
}

// ---------- saved playlists ----------

function cleanItems(items: PlaylistTrack[]): PlaylistTrack[] {
  const seen = new Set<string>();
  const out: PlaylistTrack[] = [];
  for (const it of items) {
    const vid = (it?.videoId ?? "").toString().trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(vid)) continue;
    if (seen.has(vid)) continue;
    seen.add(vid);
    out.push({
      videoId: vid,
      title: (it.title || "YouTube video").toString().slice(0, 200),
      thumbnail:
        (it.thumbnail || `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`)
          .toString()
          .slice(0, 500),
    });
    if (out.length >= PLAYLIST_MAX_ITEMS) break;
  }
  return out;
}

function cleanName(name: string): string {
  return (name ?? "").toString().trim().slice(0, PLAYLIST_MAX_NAME);
}

export async function createPlaylist(
  ownerId: string,
  name: string,
  items: PlaylistTrack[],
): Promise<
  { ok: true; playlist: SavedPlaylist } | { ok: false; error: string }
> {
  const cleanedName = cleanName(name) || "Untitled playlist";
  const cleanedItems = cleanItems(items);
  if (cleanedItems.length === 0) {
    return { ok: false, error: "A playlist needs at least one track." };
  }
  const existing = await storage().listUserPlaylistIds(ownerId);
  if (existing.length >= PLAYLISTS_PER_USER) {
    return {
      ok: false,
      error: `You already have ${PLAYLISTS_PER_USER} saved playlists. Delete one first.`,
    };
  }
  const now = Date.now();
  const playlist: SavedPlaylist = {
    id: randomBytes(12).toString("hex"),
    ownerId,
    name: cleanedName,
    items: cleanedItems,
    createdAt: now,
    updatedAt: now,
  };
  await storage().setPlaylist(playlist);
  await storage().addUserPlaylistId(ownerId, playlist.id);
  return { ok: true, playlist };
}

// Full replacement update — the client always sends the whole item list.
// Only the owner can update; we verify ownerId matches.
export async function updatePlaylist(
  ownerId: string,
  id: string,
  patch: { name?: string; items?: PlaylistTrack[] },
): Promise<
  { ok: true; playlist: SavedPlaylist } | { ok: false; error: string }
> {
  const p = await storage().getPlaylist(id);
  if (!p || p.ownerId !== ownerId) {
    return { ok: false, error: "Playlist not found" };
  }
  const next: SavedPlaylist = {
    ...p,
    name: patch.name !== undefined ? cleanName(patch.name) || p.name : p.name,
    items: patch.items !== undefined ? cleanItems(patch.items) : p.items,
    updatedAt: Date.now(),
  };
  if (next.items.length === 0) {
    return { ok: false, error: "A playlist needs at least one track." };
  }
  await storage().setPlaylist(next);
  return { ok: true, playlist: next };
}

export async function deletePlaylist(
  ownerId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = await storage().getPlaylist(id);
  if (!p || p.ownerId !== ownerId) {
    return { ok: false, error: "Playlist not found" };
  }
  await storage().deletePlaylist(id, ownerId);
  return { ok: true };
}

export async function getPlaylistForOwner(
  ownerId: string,
  id: string,
): Promise<SavedPlaylist | null> {
  const p = await storage().getPlaylist(id);
  if (!p || p.ownerId !== ownerId) return null;
  return p;
}

export async function listUserPlaylists(
  ownerId: string,
): Promise<SavedPlaylistSummary[]> {
  const ids = await storage().listUserPlaylistIds(ownerId);
  const playlists: SavedPlaylist[] = [];
  for (const id of ids) {
    const p = await storage().getPlaylist(id);
    if (p) playlists.push(p);
  }
  // Most recently updated first — that's the most useful default.
  playlists.sort((a, b) => b.updatedAt - a.updatedAt);
  return playlists.map((p) => ({
    id: p.id,
    name: p.name,
    count: p.items.length,
    updatedAt: p.updatedAt,
  }));
}
