"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import JoinForm from "@/components/JoinForm";

export default function LandingForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(
          (d as { error?: string }).error === "invalid-email"
            ? "Please enter a valid email."
            : "Something went wrong. Try again?",
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error — try again?");
    } finally {
      setSubmitting(false);
    }
  }

  function onInvite(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCode.trim();
    if (!code) return;
    router.push(`/invite/${encodeURIComponent(code)}`);
  }

  return (
    <div className="space-y-6">
      {/* Join an existing party */}
      <div className="card p-6">
        <h2 className="mb-2 text-xl font-semibold">Join a party</h2>
        <p className="mb-4 text-sm text-white/60">
          Got a party code? Enter it below to jump in.
        </p>
        <JoinForm />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
      {/* Waitlist signup */}
      <div className="card p-6">
        <h2 className="mb-2 text-xl font-semibold">Get early access</h2>
        <p className="mb-4 text-sm text-white/60">
          Drop your email and we&apos;ll let you know as soon as VideoJam launches.
        </p>
        {submitted ? (
          <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/30 px-4 py-3 text-center">
            <p className="font-medium text-emerald-300">You&apos;re on the list!</p>
            <p className="mt-1 text-sm text-white/50">
              We&apos;ll email you when it&apos;s time to party.
            </p>
          </div>
        ) : (
          <form onSubmit={onWaitlist} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="input w-full"
              required
            />
            {error ? <p className="text-sm text-red-400">{error}</p> : null}
            <button className="btn-primary w-full" disabled={submitting}>
              {submitting ? "Joining..." : "Join the waitlist"}
            </button>
          </form>
        )}
      </div>

      {/* Invite code entry */}
      <div className="card p-6">
        <h2 className="mb-2 text-xl font-semibold">Have an invite?</h2>
        <p className="mb-4 text-sm text-white/60">
          Got an invite code? Enter it here to get in early.
        </p>
        <form onSubmit={onInvite} className="space-y-3">
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="INVITE CODE"
            className="input w-full text-center font-mono tracking-wider"
            maxLength={12}
          />
          <button
            className="btn-primary w-full"
            disabled={!inviteCode.trim()}
          >
            Redeem invite
          </button>
        </form>
      </div>
      </div>
    </div>
  );
}
