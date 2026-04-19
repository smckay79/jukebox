import { getRedis } from "./kv";

export interface WaitlistEntry {
  email: string;
  createdAt: number;
}

interface WaitlistStorage {
  add(entry: WaitlistEntry): Promise<boolean>;
  list(): Promise<WaitlistEntry[]>;
  count(): Promise<number>;
  has(email: string): Promise<boolean>;
}

class MemoryWaitlistStorage implements WaitlistStorage {
  private store: Map<string, WaitlistEntry>;
  constructor() {
    const g = globalThis as unknown as {
      __videojamWaitlist?: Map<string, WaitlistEntry>;
    };
    if (!g.__videojamWaitlist) g.__videojamWaitlist = new Map();
    this.store = g.__videojamWaitlist;
  }
  async add(entry: WaitlistEntry) {
    const key = entry.email.toLowerCase();
    if (this.store.has(key)) return false;
    this.store.set(key, entry);
    return true;
  }
  async list() {
    return Array.from(this.store.values());
  }
  async count() {
    return this.store.size;
  }
  async has(email: string) {
    return this.store.has(email.toLowerCase());
  }
}

class RedisWaitlistStorage implements WaitlistStorage {
  private redis = getRedis()!;
  private key(email: string) {
    return `waitlist:${email.toLowerCase()}`;
  }
  async add(entry: WaitlistEntry) {
    const k = this.key(entry.email);
    const exists = await this.redis.exists(k);
    if (exists) return false;
    await this.redis.set(k, JSON.stringify(entry));
    await this.redis.sadd("all_waitlist_emails", entry.email.toLowerCase());
    return true;
  }
  async list() {
    const emails = (await this.redis.smembers("all_waitlist_emails")) as string[];
    const entries: WaitlistEntry[] = [];
    for (const email of emails) {
      const raw = await this.redis.get<WaitlistEntry | string>(this.key(email));
      if (!raw) continue;
      entries.push(typeof raw === "string" ? JSON.parse(raw) : raw);
    }
    return entries.sort((a, b) => b.createdAt - a.createdAt);
  }
  async count() {
    return (await this.redis.scard("all_waitlist_emails")) as number;
  }
  async has(email: string) {
    return !!(await this.redis.exists(this.key(email)));
  }
}

let storageInstance: WaitlistStorage | null = null;
function storage(): WaitlistStorage {
  if (!storageInstance) {
    storageInstance = getRedis()
      ? new RedisWaitlistStorage()
      : new MemoryWaitlistStorage();
  }
  return storageInstance;
}

export async function addToWaitlist(email: string): Promise<boolean> {
  return storage().add({ email: email.toLowerCase(), createdAt: Date.now() });
}

export async function getWaitlist(): Promise<WaitlistEntry[]> {
  return storage().list();
}

export async function getWaitlistCount(): Promise<number> {
  return storage().count();
}

export async function isOnWaitlist(email: string): Promise<boolean> {
  return storage().has(email);
}
