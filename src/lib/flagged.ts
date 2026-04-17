import { getRedis } from "./kv";

export interface FlaggedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  firstFlaggedAt: number;
  lastFlaggedAt: number;
  skipCount: number;
  parties: string[];
  globallyBanned: boolean;
  dismissedAt?: number;
}

interface FlaggedStorage {
  get(videoId: string): Promise<FlaggedVideo | null>;
  set(v: FlaggedVideo): Promise<void>;
  list(): Promise<FlaggedVideo[]>;
}

class MemoryFlaggedStorage implements FlaggedStorage {
  private store: Map<string, FlaggedVideo>;
  constructor() {
    const g = globalThis as unknown as {
      __jukeboxFlagged?: Map<string, FlaggedVideo>;
    };
    if (!g.__jukeboxFlagged) g.__jukeboxFlagged = new Map();
    this.store = g.__jukeboxFlagged;
  }
  async get(videoId: string) {
    return this.store.get(videoId) ?? null;
  }
  async set(v: FlaggedVideo) {
    this.store.set(v.videoId, v);
  }
  async list() {
    return Array.from(this.store.values());
  }
}

class RedisFlaggedStorage implements FlaggedStorage {
  private redis = getRedis()!;
  private key(videoId: string) {
    return `flagged:${videoId}`;
  }
  async get(videoId: string) {
    const raw = await this.redis.get<FlaggedVideo | string>(
      this.key(videoId),
    );
    if (!raw) return null;
    return typeof raw === "string"
      ? (JSON.parse(raw) as FlaggedVideo)
      : raw;
  }
  async set(v: FlaggedVideo) {
    await this.redis.set(this.key(v.videoId), JSON.stringify(v));
    await this.redis.sadd("all_flagged_ids", v.videoId);
  }
  async list() {
    const ids = (await this.redis.smembers("all_flagged_ids")) as string[];
    const items: FlaggedVideo[] = [];
    for (const id of ids) {
      const v = await this.get(id);
      if (v) items.push(v);
    }
    return items;
  }
}

let storageInstance: FlaggedStorage | null = null;
function storage(): FlaggedStorage {
  if (!storageInstance) {
    storageInstance = getRedis()
      ? new RedisFlaggedStorage()
      : new MemoryFlaggedStorage();
  }
  return storageInstance;
}

export async function recordCrowdSkip(
  videoId: string,
  title: string,
  thumbnail: string,
  partyCode: string,
): Promise<void> {
  const existing = await storage().get(videoId);
  if (existing) {
    existing.lastFlaggedAt = Date.now();
    existing.skipCount += 1;
    if (!existing.parties.includes(partyCode)) {
      existing.parties.push(partyCode);
    }
    await storage().set(existing);
  } else {
    await storage().set({
      videoId,
      title,
      thumbnail,
      firstFlaggedAt: Date.now(),
      lastFlaggedAt: Date.now(),
      skipCount: 1,
      parties: [partyCode],
      globallyBanned: false,
    });
  }
}

export async function isGloballyBanned(videoId: string): Promise<boolean> {
  const v = await storage().get(videoId);
  return v?.globallyBanned === true;
}

export async function setGlobalBan(
  videoId: string,
  banned: boolean,
): Promise<FlaggedVideo | null> {
  const v = await storage().get(videoId);
  if (!v) return null;
  v.globallyBanned = banned;
  if (!banned) v.dismissedAt = Date.now();
  await storage().set(v);
  return v;
}

export async function listFlaggedVideos(): Promise<FlaggedVideo[]> {
  const all = await storage().list();
  return all.sort((a, b) => b.lastFlaggedAt - a.lastFlaggedAt);
}
