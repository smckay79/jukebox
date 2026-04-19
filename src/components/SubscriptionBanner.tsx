"use client";

import type { SubscriptionInfo } from "@/lib/types";

export default function SubscriptionBanner({
  subscription,
  timeLimit,
}: {
  subscription?: SubscriptionInfo | null;
  timeLimit?: { limitMs: number; expiresAt: number; expired: boolean };
}) {
  if (timeLimit?.expired) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#120a1f] p-8 text-center shadow-2xl">
          <div className="mb-4 text-5xl">🎵</div>
          <h2 className="mb-2 text-2xl font-bold">Party time is up!</h2>
          <p className="mb-6 text-white/60">
            Free parties are limited to 1 hour. Upgrade to{" "}
            <span className="font-semibold text-brand-300">VideoJam Pro</span>{" "}
            for unlimited party time and premium features.
          </p>
          <div className="mb-4 rounded-xl bg-gradient-to-br from-brand-600/30 to-brand-800/20 p-4">
            <p className="text-3xl font-bold text-white">
              $4.99<span className="text-base font-normal text-white/50">/mo</span>
            </p>
            <ul className="mt-3 space-y-1 text-left text-sm text-white/70">
              <li>Unlimited party time</li>
              <li>Saved playlists & pre-load parties</li>
              <li>Import YouTube playlists</li>
              <li>Bumper videos between songs</li>
              <li>Queue upvoting</li>
              <li>Custom backgrounds & logos</li>
            </ul>
          </div>
          <a
            href="/pricing"
            className="btn-primary inline-block w-full text-center"
          >
            Upgrade to Pro
          </a>
        </div>
      </div>
    );
  }

  if (!subscription) return null;

  if (subscription.tier === "trial" && subscription.daysLeft <= 7) {
    return (
      <div className="rounded-lg bg-blue-900/30 border border-blue-500/20 px-4 py-2 text-sm">
        <span className="font-medium text-blue-300">
          Trial ends in {subscription.daysLeft} day{subscription.daysLeft !== 1 ? "s" : ""}
        </span>
        <span className="text-white/50"> · </span>
        <a href="/pricing" className="text-blue-300 underline underline-offset-2 hover:text-blue-200">
          Upgrade to Pro
        </a>
      </div>
    );
  }

  if (subscription.tier === "free") {
    return (
      <div className="rounded-lg bg-amber-900/30 border border-amber-500/20 px-4 py-2 text-sm">
        <span className="font-medium text-amber-300">
          Free plan
        </span>
        <span className="text-white/50"> · Some features are locked · </span>
        <a href="/pricing" className="text-amber-300 underline underline-offset-2 hover:text-amber-200">
          Upgrade to Pro — $4.99/mo
        </a>
      </div>
    );
  }

  return null;
}
