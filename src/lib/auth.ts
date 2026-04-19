import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getRedis } from "./kv";
import { getSubscriptionInfo } from "./subscription";
import type { PublicUser, User } from "./types";
import { getUser } from "./users";

// Auth model — opaque session ID signed with HMAC-SHA256 and stored server-
// side. Keeping the cookie opaque (not a JWT) means the client can't read
// or tamper with any claims; we always round-trip to Redis (or the in-memory
// fallback) to resolve the user.
//
// Cookie format: `<sessionId>.<hex sha256 of sessionId>`
// Session record: `session:<sessionId>` → JSON { userId, expiresAt }
//
// Sliding 30-day expiry — every verify bumps the cookie + record forward.

export const SESSION_COOKIE = "jb_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface SessionRecord {
  userId: string;
  expiresAt: number;
}

// Fail loud in prod when this is missing. In dev we generate an ephemeral
// key so `npm run dev` still works without a .env — existing sessions just
// get invalidated on restart.
function getAuthSecret(): string {
  const fromEnv = process.env.AUTH_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET is required in production (32+ random bytes).",
    );
  }
  const g = globalThis as unknown as { __videojamDevSecret?: string };
  if (!g.__videojamDevSecret) {
    g.__videojamDevSecret = randomBytes(32).toString("hex");
    console.warn(
      "[auth] No AUTH_SECRET set; generated an ephemeral one for dev. " +
        "Sessions will not survive process restarts.",
    );
  }
  return g.__videojamDevSecret;
}

function sign(value: string): string {
  return createHmac("sha256", getAuthSecret()).update(value).digest("hex");
}

function verifySig(value: string, sig: string): boolean {
  const expected = sign(value);
  if (expected.length !== sig.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
}

// ---------- session storage (redis + memory fallback) ----------

interface SessionStorage {
  get(id: string): Promise<SessionRecord | null>;
  set(id: string, rec: SessionRecord, ttlSeconds: number): Promise<void>;
  del(id: string): Promise<void>;
}

class MemorySessions implements SessionStorage {
  private store: Map<string, SessionRecord>;
  constructor() {
    const g = globalThis as unknown as {
      __videojamSessions?: Map<string, SessionRecord>;
    };
    if (!g.__videojamSessions) g.__videojamSessions = new Map();
    this.store = g.__videojamSessions;
  }
  async get(id: string) {
    const rec = this.store.get(id);
    if (!rec) return null;
    if (rec.expiresAt < Date.now()) {
      this.store.delete(id);
      return null;
    }
    return rec;
  }
  async set(id: string, rec: SessionRecord) {
    this.store.set(id, rec);
  }
  async del(id: string) {
    this.store.delete(id);
  }
}

class RedisSessions implements SessionStorage {
  private redis = getRedis()!;
  private key(id: string) {
    return `session:${id}`;
  }
  async get(id: string) {
    const raw = await this.redis.get<SessionRecord | string>(this.key(id));
    if (!raw) return null;
    const rec = typeof raw === "string" ? (JSON.parse(raw) as SessionRecord) : raw;
    if (rec.expiresAt < Date.now()) {
      await this.redis.del(this.key(id));
      return null;
    }
    return rec;
  }
  async set(id: string, rec: SessionRecord, ttlSeconds: number) {
    await this.redis.set(this.key(id), JSON.stringify(rec), { ex: ttlSeconds });
  }
  async del(id: string) {
    await this.redis.del(this.key(id));
  }
}

let sessions: SessionStorage | null = null;
function sessionStore(): SessionStorage {
  if (!sessions) {
    sessions = getRedis() ? new RedisSessions() : new MemorySessions();
  }
  return sessions;
}

// ---------- public API ----------

export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  await sessionStore().set(id, { userId, expiresAt }, Math.floor(SESSION_TTL_MS / 1000));
  return `${id}.${sign(id)}`;
}

// Resolves the signed cookie to a (userId, sessionId). Returns null when the
// cookie is missing, malformed, signature invalid, or session expired.
async function resolveCookie(
  cookieValue: string | undefined,
): Promise<{ sessionId: string; userId: string } | null> {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf(".");
  if (dot < 1) return null;
  const sessionId = cookieValue.slice(0, dot);
  const sig = cookieValue.slice(dot + 1);
  if (!verifySig(sessionId, sig)) return null;
  const rec = await sessionStore().get(sessionId);
  if (!rec) return null;
  return { sessionId, userId: rec.userId };
}

// Convenience for route handlers. Reads the cookie off the incoming
// request (via next/headers cookies()), resolves to a User, returns null
// if not signed in.
export async function getSessionUser(): Promise<User | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const resolved = await resolveCookie(token);
  if (!resolved) return null;
  return getUser(resolved.userId);
}

export async function destroySessionFromCookie(): Promise<void> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return;
  const sessionId = token.slice(0, dot);
  await sessionStore().del(sessionId);
}

export function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    subscription: getSubscriptionInfo(u),
  };
}

// ---------- Google ID token verification ----------

// Verify a Google-issued ID token by hitting their tokeninfo endpoint.
// Simple and dep-free; for high volume this should switch to local JWT
// verification with cached JWKs, but at party-app scale tokeninfo is fine.
export interface GoogleIdClaims {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<GoogleIdClaims | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("[auth] GOOGLE_CLIENT_ID is not set");
    return null;
  }
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      aud?: string;
      iss?: string;
      sub?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
      picture?: string;
      exp?: string | number;
    };
    if (data.aud !== clientId) return null;
    const iss = data.iss ?? "";
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
      return null;
    }
    const exp = Number(data.exp ?? 0);
    if (!exp || exp * 1000 < Date.now()) return null;
    if (!data.sub) return null;
    const verified =
      data.email_verified === true || data.email_verified === "true";
    if (!verified || !data.email) return null;
    return {
      sub: data.sub,
      email: data.email,
      name: data.name ?? data.email,
      picture: data.picture,
    };
  } catch (err) {
    console.error("[auth] tokeninfo failed", err);
    return null;
  }
}
