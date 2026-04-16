import { getSessionUser } from "./auth";
import type { User } from "./types";

const BUILTIN_ADMINS = new Set(["scott.mckay@controlaltdeleted.com"]);

function getAdminEmails(): Set<string> {
  const extra = process.env.ADMIN_EMAILS;
  if (!extra) return BUILTIN_ADMINS;
  const merged = new Set(BUILTIN_ADMINS);
  for (const e of extra.split(",")) {
    const trimmed = e.trim().toLowerCase();
    if (trimmed) merged.add(trimmed);
  }
  return merged;
}

export function isAdminEmail(email: string): boolean {
  return getAdminEmails().has(email.toLowerCase());
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getSessionUser();
  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  return user;
}
