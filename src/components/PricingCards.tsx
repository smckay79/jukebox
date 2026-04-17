"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PublicUser } from "@/lib/types";

const FREE_FEATURES = [
  "Create parties",
  "Search & add songs",
  "1-hour party limit",
  "Basic backgrounds",
];

const PRO_FEATURES = [
  "Unlimited party time",
  "Saved playlists & pre-load parties",
  "Import YouTube playlists",
  "Bumper videos between songs",
  "Queue upvoting",
  "Custom backgrounds & logos",
  "Scrolling marquee messages",
  "Custom party codes (coming soon)",
];

export default function PricingCards() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const success = searchParams.get("success") === "1";
  const canceled = searchParams.get("canceled") === "1";

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function startCheckout(plan: "monthly" | "yearly" | "lifetime") {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(null);
    }
  }

  const isPro =
    user?.subscription.tier === "pro" || user?.subscription.tier === "trial";
  const isTrial = user?.subscription.tier === "trial";
  const isPaid =
    user?.subscription.tier === "pro" && user?.subscription.paidUntil !== null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-4">
        <Link
          href="/"
          className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
        >
          Jukebox
        </Link>
      </div>
      <h1 className="mb-2 text-3xl font-bold">Pick your plan</h1>
      <p className="mb-10 text-white/60">
        Start with a free 30-day trial of everything. After that, upgrade to
        keep the party going.
      </p>

      {success && (
        <div className="mb-6 rounded-lg bg-emerald-900/40 px-4 py-3 text-sm text-emerald-300">
          You&apos;re all set! Your Pro subscription is now active.
        </div>
      )}
      {canceled && (
        <div className="mb-6 rounded-lg bg-yellow-900/30 px-4 py-3 text-sm text-yellow-300">
          Checkout was canceled — no charge was made.
        </div>
      )}
      {error && (
        <div className="mb-6 rounded-lg bg-red-900/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Free tier */}
        <div className="card space-y-4 p-6">
          <div>
            <h2 className="text-lg font-bold">Free</h2>
            <p className="text-3xl font-bold">
              $0<span className="text-base font-normal text-white/50">/mo</span>
            </p>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-white/30">—</span>
                {f}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro tier */}
        <div className="card relative space-y-4 border border-brand-500/30 bg-gradient-to-br from-brand-900/30 to-brand-800/10 p-6">
          <div className="absolute -top-3 right-4 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold">
            Introductory pricing
          </div>
          <div>
            <h2 className="text-lg font-bold">Pro</h2>
            <div className="mt-1 flex items-baseline gap-4">
              <div>
                <p className="text-3xl font-bold">
                  $4.99
                  <span className="text-base font-normal text-white/50">
                    /mo
                  </span>
                </p>
              </div>
              <div className="border-l border-white/10 pl-4">
                <p className="text-3xl font-bold">
                  $39.99
                  <span className="text-base font-normal text-white/50">
                    /yr
                  </span>
                </p>
                <p className="text-xs text-emerald-400">Save 33%</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-white/40">
              30-day free trial included
            </p>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-brand-400">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {loading ? (
            <div className="h-10" />
          ) : !user ? (
            <Link
              href="/login?next=/pricing"
              className="btn-primary block w-full text-center"
            >
              Sign in to start free trial
            </Link>
          ) : isPaid ? (
            <div className="space-y-2">
              <div className="rounded-lg bg-emerald-900/30 px-3 py-2 text-center text-sm text-emerald-300">
                You&apos;re on Pro
                {user.subscription.daysLeft < Infinity
                  ? ` · ${user.subscription.daysLeft} days left`
                  : ""}
              </div>
              <button
                type="button"
                className="btn-ghost w-full text-center text-sm"
                onClick={openPortal}
                disabled={busy === "portal"}
              >
                {busy === "portal" ? "Loading…" : "Manage subscription"}
              </button>
            </div>
          ) : isTrial ? (
            <div className="space-y-2">
              <div className="mb-1 rounded-lg bg-brand-900/30 px-3 py-2 text-center text-xs text-brand-300">
                Trial active · {user.subscription.daysLeft} days left
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-primary text-center text-sm"
                  onClick={() => startCheckout("monthly")}
                  disabled={busy !== null}
                >
                  {busy === "monthly" ? "Loading…" : "$4.99/mo"}
                </button>
                <button
                  type="button"
                  className="btn-primary text-center text-sm"
                  onClick={() => startCheckout("yearly")}
                  disabled={busy !== null}
                >
                  {busy === "yearly" ? "Loading…" : "$39.99/yr"}
                </button>
              </div>
              <p className="text-center text-[11px] text-white/40">
                You won&apos;t be charged until your trial ends
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-primary text-center text-sm"
                  onClick={() => startCheckout("monthly")}
                  disabled={busy !== null}
                >
                  {busy === "monthly" ? "Loading…" : "$4.99/mo"}
                </button>
                <button
                  type="button"
                  className="btn-primary text-center text-sm"
                  onClick={() => startCheckout("yearly")}
                  disabled={busy !== null}
                >
                  {busy === "yearly" ? "Loading…" : "$39.99/yr"}
                </button>
              </div>
              <p className="text-center text-[11px] text-white/40">
                Includes 30-day free trial · cancel anytime
              </p>
            </div>
          )}
        </div>

        {/* Lifetime tier */}
        <div className="card relative space-y-4 border border-emerald-500/30 bg-gradient-to-br from-emerald-900/20 to-emerald-800/10 p-6">
          <div className="absolute -top-3 right-4 rounded-full bg-emerald-600 px-3 py-0.5 text-xs font-semibold">
            Best value
          </div>
          <div>
            <h2 className="text-lg font-bold">Lifetime</h2>
            <p className="text-3xl font-bold">
              $74.99
              <span className="text-base font-normal text-white/50">
                {" "}one-time
              </span>
            </p>
            <p className="mt-2 text-xs text-white/40">
              Pay once, party forever
            </p>
          </div>
          <ul className="space-y-2 text-sm text-white/70">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2">
                <span className="mt-0.5 text-emerald-400">✓</span>
                {f}
              </li>
            ))}
            <li className="flex items-start gap-2">
              <span className="mt-0.5 text-emerald-400">✓</span>
              <span className="font-medium text-emerald-300">
                All future updates included
              </span>
            </li>
          </ul>

          {loading ? (
            <div className="h-10" />
          ) : !user ? (
            <Link
              href="/login?next=/pricing"
              className="btn-primary block w-full !bg-emerald-600 text-center hover:!bg-emerald-500"
            >
              Sign in to get started
            </Link>
          ) : isPaid ? (
            <div className="rounded-lg bg-emerald-900/30 px-3 py-2 text-center text-sm text-emerald-300">
              You&apos;re on Pro
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary w-full !bg-emerald-600 text-center hover:!bg-emerald-500"
              onClick={() => startCheckout("lifetime")}
              disabled={busy !== null}
            >
              {busy === "lifetime" ? "Loading…" : "Get lifetime access — $74.99"}
            </button>
          )}
        </div>
      </div>

      {user && user.subscription.tier === "pro" && user.subscription.paidUntil && (
        <p className="mt-6 text-center text-xs text-white/40">
          Need to cancel or update payment?{" "}
          <button
            type="button"
            className="text-brand-300 underline-offset-2 hover:underline"
            onClick={openPortal}
            disabled={busy === "portal"}
          >
            Manage subscription
          </button>
        </p>
      )}
    </main>
  );
}
