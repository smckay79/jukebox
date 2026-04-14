import { Redis } from "@upstash/redis";

// Returns a Redis client if Upstash credentials are present in the env,
// otherwise null (callers fall back to in-memory storage).
//
// Supported env var pairs (first match wins):
//   KV_REST_API_URL / KV_REST_API_TOKEN        ← Vercel Marketplace KV
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   ← direct Upstash
let cached: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (cached !== undefined) return cached;

  const url =
    process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    cached = null;
    return null;
  }
  cached = new Redis({ url, token });
  return cached;
}
