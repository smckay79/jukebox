import type { ExtractResult } from "./extract.js";

// Short-lived in-memory cache so /stream (which may get several range
// requests for the same video as the player seeks/buffers) doesn't re-run a
// full getInfo()/decipher() per request. Well under googlevideo's own
// multi-hour URL expiry — just needs to survive one playback session.
const CACHE_TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { result: ExtractResult; cachedAt: number }>();

export function getCached(videoId: string): ExtractResult | undefined {
  const entry = cache.get(videoId);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(videoId);
    return undefined;
  }
  return entry.result;
}

export function setCached(videoId: string, result: ExtractResult): void {
  cache.set(videoId, { result, cachedAt: Date.now() });
}

export function deleteCached(videoId: string): void {
  cache.delete(videoId);
}
