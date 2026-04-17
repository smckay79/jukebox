import { getRedis } from "./kv";

export interface SkipBumper {
  videoId: string;
  title: string;
  thumbnail: string;
  addedAt: number;
  enabled: boolean;
}

const REDIS_KEY = "global_skip_bumpers";

// In-memory fallback for local dev (single-process only).
const g = globalThis as unknown as { __skipBumpers?: SkipBumper[] };
if (!g.__skipBumpers) g.__skipBumpers = [];

async function load(): Promise<SkipBumper[]> {
  const r = getRedis();
  if (r) {
    const raw = await r.get<SkipBumper[] | string>(REDIS_KEY);
    if (!raw) return [];
    return typeof raw === "string" ? (JSON.parse(raw) as SkipBumper[]) : raw;
  }
  return g.__skipBumpers!;
}

async function save(bumpers: SkipBumper[]): Promise<void> {
  const r = getRedis();
  if (r) {
    await r.set(REDIS_KEY, JSON.stringify(bumpers));
  } else {
    g.__skipBumpers = bumpers;
  }
}

export async function listSkipBumpers(): Promise<SkipBumper[]> {
  return load();
}

export async function addSkipBumper(
  videoId: string,
  title: string,
  thumbnail: string,
): Promise<SkipBumper> {
  const bumpers = await load();
  const existing = bumpers.find((b) => b.videoId === videoId);
  if (existing) return existing;
  const bumper: SkipBumper = {
    videoId,
    title: title.slice(0, 200) || "Skip bumper",
    thumbnail:
      thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    addedAt: Date.now(),
    enabled: true,
  };
  bumpers.push(bumper);
  await save(bumpers);
  return bumper;
}

export async function removeSkipBumper(videoId: string): Promise<void> {
  const bumpers = await load();
  await save(bumpers.filter((b) => b.videoId !== videoId));
}

export async function toggleSkipBumper(
  videoId: string,
  enabled: boolean,
): Promise<SkipBumper | null> {
  const bumpers = await load();
  const b = bumpers.find((x) => x.videoId === videoId);
  if (!b) return null;
  b.enabled = enabled;
  await save(bumpers);
  return b;
}

export async function pickRandomSkipBumper(): Promise<SkipBumper | null> {
  const bumpers = await load();
  const enabled = bumpers.filter((b) => b.enabled);
  if (enabled.length === 0) return null;
  return enabled[Math.floor(Math.random() * enabled.length)];
}
