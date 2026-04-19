import { randomBytes } from "crypto";
import { getRedis } from "./kv";
import type { InviteCode } from "./types";

const INVITE_CODE_LENGTH = 8;
const MAX_INVITES_PER_USER = 5;
const DEFAULT_GRANT_DAYS = 90; // 3 months

interface InviteStorage {
  get(code: string): Promise<InviteCode | null>;
  set(invite: InviteCode): Promise<void>;
  list(): Promise<InviteCode[]>;
  listByCreator(userId: string): Promise<InviteCode[]>;
}

class MemoryInviteStorage implements InviteStorage {
  private store: Map<string, InviteCode>;
  constructor() {
    const g = globalThis as unknown as {
      __videojamInvites?: Map<string, InviteCode>;
    };
    if (!g.__videojamInvites) g.__videojamInvites = new Map();
    this.store = g.__videojamInvites;
  }
  async get(code: string) {
    return this.store.get(code.toUpperCase()) ?? null;
  }
  async set(invite: InviteCode) {
    this.store.set(invite.code, invite);
  }
  async list() {
    return Array.from(this.store.values());
  }
  async listByCreator(userId: string) {
    return Array.from(this.store.values()).filter(
      (i) => i.createdBy === userId,
    );
  }
}

class RedisInviteStorage implements InviteStorage {
  private redis = getRedis()!;
  private key(code: string) {
    return `invite:${code}`;
  }
  async get(code: string) {
    const raw = await this.redis.get<InviteCode | string>(
      this.key(code.toUpperCase()),
    );
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as InviteCode) : raw;
  }
  async set(invite: InviteCode) {
    await this.redis.set(this.key(invite.code), JSON.stringify(invite));
    await this.redis.sadd("all_invite_codes", invite.code);
  }
  async list() {
    const codes = (await this.redis.smembers("all_invite_codes")) as string[];
    const invites: InviteCode[] = [];
    for (const code of codes) {
      const inv = await this.get(code);
      if (inv) invites.push(inv);
    }
    return invites;
  }
  async listByCreator(userId: string) {
    const all = await this.list();
    return all.filter((i) => i.createdBy === userId);
  }
}

let storageInstance: InviteStorage | null = null;
function storage(): InviteStorage {
  if (!storageInstance) {
    storageInstance = getRedis()
      ? new RedisInviteStorage()
      : new MemoryInviteStorage();
  }
  return storageInstance;
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(INVITE_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export async function createInvite(opts: {
  createdBy: string;
  createdByName: string;
  type: "admin" | "referral";
  maxUses?: number;
  grantDays?: number;
  recipientEmail?: string;
  message?: string;
  expiresAt?: number;
}): Promise<InviteCode> {
  const invite: InviteCode = {
    code: generateCode(),
    createdAt: Date.now(),
    createdBy: opts.createdBy,
    createdByName: opts.createdByName,
    type: opts.type,
    maxUses: opts.maxUses ?? 1,
    uses: 0,
    grantDays: opts.grantDays ?? DEFAULT_GRANT_DAYS,
    recipientEmail: opts.recipientEmail,
    message: opts.message,
    expiresAt: opts.expiresAt,
    redeemedBy: [],
  };
  await storage().set(invite);
  return invite;
}

export async function getInvite(code: string): Promise<InviteCode | null> {
  return storage().get(code.toUpperCase());
}

export async function listAllInvites(): Promise<InviteCode[]> {
  const all = await storage().list();
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listUserInvites(userId: string): Promise<InviteCode[]> {
  const invites = await storage().listByCreator(userId);
  return invites.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getUserInviteCount(userId: string): Promise<number> {
  const invites = await storage().listByCreator(userId);
  return invites.filter(
    (i) => i.type === "referral" && !i.revokedAt,
  ).length;
}

export async function canUserCreateInvite(userId: string): Promise<boolean> {
  const count = await getUserInviteCount(userId);
  return count < MAX_INVITES_PER_USER;
}

export type RedeemResult =
  | { ok: true; grantDays: number; inviterName: string }
  | { ok: false; reason: string };

export async function redeemInvite(
  code: string,
  userId: string,
  email: string,
): Promise<RedeemResult> {
  const invite = await storage().get(code.toUpperCase());
  if (!invite) return { ok: false, reason: "Invite code not found" };
  if (invite.revokedAt) return { ok: false, reason: "This invite has been revoked" };
  if (invite.expiresAt && Date.now() > invite.expiresAt) {
    return { ok: false, reason: "This invite has expired" };
  }
  if (invite.maxUses !== -1 && invite.uses >= invite.maxUses) {
    return { ok: false, reason: "This invite has already been used" };
  }
  if (
    invite.recipientEmail &&
    invite.recipientEmail.toLowerCase() !== email.toLowerCase()
  ) {
    return { ok: false, reason: "This invite was sent to a different email" };
  }
  const alreadyRedeemed = invite.redeemedBy.some((r) => r.userId === userId);
  if (alreadyRedeemed) {
    return { ok: false, reason: "You've already used this invite" };
  }

  invite.uses += 1;
  invite.redeemedBy.push({ userId, email, redeemedAt: Date.now() });
  await storage().set(invite);

  return { ok: true, grantDays: invite.grantDays, inviterName: invite.createdByName };
}

export async function revokeInvite(code: string): Promise<boolean> {
  const invite = await storage().get(code.toUpperCase());
  if (!invite) return false;
  invite.revokedAt = Date.now();
  await storage().set(invite);
  return true;
}

export { MAX_INVITES_PER_USER };
