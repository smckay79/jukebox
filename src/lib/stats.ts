import { getRedis } from "./kv";

// Per-party host-only telemetry: how many tabs are watching, who's been adding
// songs (by IP), and which IPs the host has muted for an hour. All state is
// short-lived — viewers expire as their SSE connections drop, activity is a
// capped ring, and IP bans carry their own expiry.

export interface ActivityEntry {
  at: number;
  ip: string;
  userId: string;
  videoId: string;
  title: string;
  addedBy: string;
  kind: "single" | "bulk";
}

export interface IpBan {
  ip: string;
  until: number; // epoch ms
  addedAt: number;
}

const VIEWER_TTL_MS = 30_000; // viewer considered live if last heartbeat within this
const ACTIVITY_MAX = 200; // cap recent activity per party
const IP_BAN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ---------- in-memory fallback ----------
// Mirrors the shape we use on Redis, keyed by party code. Only reachable in
// local dev / tests where KV is not configured. Hung off globalThis so it
// survives HMR / module reloads within a single process.

interface MemStats {
  viewers: Map<string, Map<string, number>>; // code -> viewerId -> expiryAt
  activity: Map<string, ActivityEntry[]>;
  ipBans: Map<string, Map<string, IpBan>>; // code -> ip -> IpBan
}

function mem(): MemStats {
  const g = globalThis as unknown as { __jukeboxStats?: MemStats };
  if (!g.__jukeboxStats) {
    g.__jukeboxStats = {
      viewers: new Map(),
      activity: new Map(),
      ipBans: new Map(),
    };
  }
  return g.__jukeboxStats;
}

function now(): number {
  return Date.now();
}

function code(c: string): string {
  return c.toUpperCase();
}

function viewerKey(c: string): string {
  return `party:${code(c)}:viewers`;
}
function activityKey(c: string): string {
  return `party:${code(c)}:activity`;
}
function ipBansKey(c: string): string {
  return `party:${code(c)}:ipbans`;
}

// ---------- viewers ----------

// Call on SSE open to add the viewer and again on every heartbeat to extend
// their expiry. Using a sorted set with score = expiry lets us atomically
// expire dead viewers in countViewers().
export async function touchViewer(
  c: string,
  viewerId: string,
): Promise<void> {
  if (!viewerId) return;
  const expires = now() + VIEWER_TTL_MS;
  const r = getRedis();
  if (r) {
    await r.zadd(viewerKey(c), { score: expires, member: viewerId });
    // Opportunistic cleanup so the set doesn't grow unbounded.
    await r.zremrangebyscore(viewerKey(c), 0, now());
    // Keep the key alive across idle periods but not forever.
    await r.expire(viewerKey(c), 60 * 60);
    return;
  }
  const m = mem().viewers;
  let set = m.get(code(c));
  if (!set) {
    set = new Map();
    m.set(code(c), set);
  }
  set.set(viewerId, expires);
}

export async function dropViewer(
  c: string,
  viewerId: string,
): Promise<void> {
  if (!viewerId) return;
  const r = getRedis();
  if (r) {
    await r.zrem(viewerKey(c), viewerId);
    return;
  }
  const set = mem().viewers.get(code(c));
  set?.delete(viewerId);
}

export async function countViewers(c: string): Promise<number> {
  const r = getRedis();
  if (r) {
    await r.zremrangebyscore(viewerKey(c), 0, now());
    const n = await r.zcard(viewerKey(c));
    return typeof n === "number" ? n : 0;
  }
  const set = mem().viewers.get(code(c));
  if (!set) return 0;
  const t = now();
  for (const [k, exp] of set) if (exp <= t) set.delete(k);
  return set.size;
}

// ---------- activity log ----------

export async function logActivity(
  c: string,
  entries: ActivityEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const r = getRedis();
  if (r) {
    // LPUSH each JSON entry then LTRIM to the cap. Upstash's pipeline-by-
    // default means this is still one round-trip in practice.
    const payload = entries.map((e) => JSON.stringify(e));
    await r.lpush(activityKey(c), ...payload);
    await r.ltrim(activityKey(c), 0, ACTIVITY_MAX - 1);
    await r.expire(activityKey(c), 60 * 60 * 24 * 7);
    return;
  }
  const list = mem().activity.get(code(c)) ?? [];
  // Newest first, same as the Redis LPUSH order.
  const next = entries.slice().reverse().concat(list).slice(0, ACTIVITY_MAX);
  mem().activity.set(code(c), next);
}

export async function getActivity(c: string): Promise<ActivityEntry[]> {
  const r = getRedis();
  if (r) {
    const raw = await r.lrange<string>(activityKey(c), 0, ACTIVITY_MAX - 1);
    const out: ActivityEntry[] = [];
    for (const s of raw ?? []) {
      // Upstash may return already-parsed JSON or a string; handle both.
      if (typeof s === "string") {
        try {
          out.push(JSON.parse(s) as ActivityEntry);
        } catch {
          /* skip malformed */
        }
      } else if (s && typeof s === "object") {
        out.push(s as ActivityEntry);
      }
    }
    return out;
  }
  return (mem().activity.get(code(c)) ?? []).slice();
}

// ---------- IP bans ----------

export async function banIp(c: string, ip: string): Promise<IpBan | null> {
  const clean = ip.trim();
  if (!clean || clean === "unknown") return null;
  const ban: IpBan = {
    ip: clean,
    until: now() + IP_BAN_TTL_MS,
    addedAt: now(),
  };
  const r = getRedis();
  if (r) {
    await r.hset(ipBansKey(c), { [clean]: JSON.stringify(ban) });
    await r.expire(ipBansKey(c), 60 * 60 * 24);
    return ban;
  }
  let map = mem().ipBans.get(code(c));
  if (!map) {
    map = new Map();
    mem().ipBans.set(code(c), map);
  }
  map.set(clean, ban);
  return ban;
}

export async function unbanIp(c: string, ip: string): Promise<void> {
  const clean = ip.trim();
  if (!clean) return;
  const r = getRedis();
  if (r) {
    await r.hdel(ipBansKey(c), clean);
    return;
  }
  mem().ipBans.get(code(c))?.delete(clean);
}

export async function getIpBans(c: string): Promise<IpBan[]> {
  const r = getRedis();
  let raw: Record<string, unknown> | null = null;
  if (r) {
    raw = (await r.hgetall(ipBansKey(c))) as Record<string, unknown> | null;
  } else {
    const m = mem().ipBans.get(code(c));
    if (m) {
      raw = {};
      for (const [k, v] of m) raw[k] = v;
    }
  }
  if (!raw) return [];
  const t = now();
  const out: IpBan[] = [];
  const expiredKeys: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    let ban: IpBan | null = null;
    if (typeof v === "string") {
      try {
        ban = JSON.parse(v) as IpBan;
      } catch {
        /* skip */
      }
    } else if (v && typeof v === "object") {
      ban = v as IpBan;
    }
    if (!ban) continue;
    if (ban.until <= t) {
      expiredKeys.push(k);
      continue;
    }
    out.push(ban);
  }
  // Clean up expired entries best-effort.
  if (expiredKeys.length > 0) {
    const rr = getRedis();
    if (rr) {
      await rr.hdel(ipBansKey(c), ...expiredKeys);
    } else {
      const m = mem().ipBans.get(code(c));
      for (const k of expiredKeys) m?.delete(k);
    }
  }
  out.sort((a, b) => a.until - b.until);
  return out;
}

export async function isIpBanned(c: string, ip: string): Promise<boolean> {
  const clean = ip.trim();
  if (!clean || clean === "unknown") return false;
  const r = getRedis();
  let raw: unknown = null;
  if (r) {
    raw = await r.hget(ipBansKey(c), clean);
  } else {
    const m = mem().ipBans.get(code(c));
    const v = m?.get(clean);
    if (v) raw = v;
  }
  if (!raw) return false;
  let ban: IpBan | null = null;
  if (typeof raw === "string") {
    try {
      ban = JSON.parse(raw) as IpBan;
    } catch {
      return false;
    }
  } else if (typeof raw === "object") {
    ban = raw as IpBan;
  }
  if (!ban) return false;
  if (ban.until <= now()) {
    await unbanIp(c, clean);
    return false;
  }
  return true;
}

// ---------- helpers ----------

// Best-effort client IP from proxy headers. Vercel / most CDNs set
// x-forwarded-for as a comma-separated chain; the leftmost entry is the
// original client. Falls back to x-real-ip, then "unknown".
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
