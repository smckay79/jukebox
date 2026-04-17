import type { SubscriptionInfo, SubscriptionTier, User } from "./types";

export const TRIAL_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FREE_PARTY_LIMIT_MS = 60 * 60 * 1000; // 1 hour

const OWNER_EMAILS = new Set(
  (process.env.OWNER_EMAIL || "scott.mckay@controlaltdeleted.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function isOwner(email: string): boolean {
  return OWNER_EMAILS.has(email.toLowerCase());
}

export function getSubscriptionInfo(user: User): SubscriptionInfo {
  const trialEndsAt = user.createdAt + TRIAL_DURATION_MS;
  const paidUntil = user.subscriptionPaidUntil ?? null;
  const now = Date.now();

  let tier: SubscriptionTier;
  let daysLeft: number;
  const owner = isOwner(user.email);

  if (owner) {
    tier = "pro";
    daysLeft = Infinity;
  } else if (user.subscriptionOverride === "pro") {
    tier = "pro";
    daysLeft = Infinity;
  } else if (user.subscriptionOverride === "none") {
    tier = "free";
    daysLeft = 0;
  } else if (paidUntil && paidUntil > now) {
    tier = "pro";
    daysLeft = Math.ceil((paidUntil - now) / (24 * 60 * 60 * 1000));
  } else if (now < trialEndsAt) {
    tier = "trial";
    daysLeft = Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000));
  } else {
    tier = "free";
    daysLeft = 0;
  }

  return { tier, trialEndsAt, paidUntil, daysLeft, isOwner: owner };
}

export type GatedFeature =
  | "saved_playlists"
  | "custom_party_code"
  | "custom_background"
  | "bumpers"
  | "youtube_import"
  | "upvote"
  | "unlimited_party_time"
  | "marquee";

export function canUseFeature(user: User, _feature: GatedFeature): boolean {
  const { tier } = getSubscriptionInfo(user);
  return tier === "pro" || tier === "trial";
}

export function isPartyExpired(
  partyCreatedAt: number,
  hostUser: User | null,
): boolean {
  if (hostUser) {
    const { tier } = getSubscriptionInfo(hostUser);
    if (tier === "pro" || tier === "trial") return false;
  }
  return Date.now() - partyCreatedAt > FREE_PARTY_LIMIT_MS;
}

export function getPartyTimeLimit(hostUser: User | null): {
  limitMs: number;
  unlimited: boolean;
} {
  if (hostUser) {
    const { tier } = getSubscriptionInfo(hostUser);
    if (tier === "pro" || tier === "trial") {
      return { limitMs: Infinity, unlimited: true };
    }
  }
  return { limitMs: FREE_PARTY_LIMIT_MS, unlimited: false };
}
