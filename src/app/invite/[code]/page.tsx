"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import type { PublicUser } from "@/lib/types";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface InviteInfo {
  code: string;
  inviterName: string;
  message?: string;
  grantDays: number;
  valid: boolean;
  expired: boolean;
  exhausted: boolean;
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/invites/${code}`)
        .then((r) => {
          if (!r.ok) {
            setNotFound(true);
            return null;
          }
          return r.json();
        })
        .then((d) => d && setInvite(d)),
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then((d) => setUser(d.user ?? null))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [code]);

  const onSignedIn = useCallback(
    (signedInUser: PublicUser) => {
      setUser(signedInUser);
    },
    [],
  );

  async function redeem() {
    setRedeeming(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "redeem", code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to redeem invite");
        return;
      }
      setRedeemed(true);
    } catch {
      setError("Network error — try again");
    } finally {
      setRedeeming(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-white/50">Loading...</div>
      </main>
    );
  }

  if (notFound || !invite) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-4 text-5xl">🎵</div>
          <h1 className="mb-2 text-2xl font-bold">Invite not found</h1>
          <p className="mb-6 text-white/60">
            This invite code doesn&apos;t exist or has been revoked.
          </p>
          <Link href="/" className="btn-primary inline-block px-6">
            Go to Jukebox
          </Link>
        </div>
      </main>
    );
  }

  if (redeemed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/30 to-emerald-800/10 p-8">
            <div className="mb-4 text-5xl">🎉</div>
            <h1 className="mb-2 text-2xl font-bold">You&apos;re in!</h1>
            <p className="mb-2 text-white/70">
              {Math.round(invite.grantDays / 30)} months of Jukebox Pro activated.
            </p>
            <p className="text-sm text-white/50">
              Thanks to {invite.inviterName} for the invite.
            </p>
          </div>
          <button
            onClick={() => router.push("/")}
            className="btn-primary w-full"
          >
            Start a party
          </button>
        </div>
      </main>
    );
  }

  const months = Math.round(invite.grantDays / 30);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#120a1f] shadow-2xl">
          {/* Gradient header */}
          <div className="bg-gradient-to-br from-brand-600 to-pink-600 px-6 py-8 text-center">
            <div className="mb-2 text-4xl">♪</div>
            <h1 className="text-2xl font-bold">You&apos;re invited!</h1>
            <p className="mt-1 text-white/90">
              {invite.inviterName} wants you at the party
            </p>
          </div>

          <div className="space-y-5 p-6">
            {/* Personal message */}
            {invite.message && (
              <div className="rounded-lg border-l-2 border-brand-500 bg-white/5 px-4 py-3">
                <p className="text-sm italic text-white/70">
                  &ldquo;{invite.message}&rdquo;
                </p>
                <p className="mt-1 text-xs text-white/40">
                  — {invite.inviterName}
                </p>
              </div>
            )}

            {/* What you get */}
            <div className="rounded-xl bg-white/5 p-4 text-center">
              <p className="text-xs uppercase tracking-wider text-white/40">
                Your invite includes
              </p>
              <p className="mt-1 text-2xl font-bold text-brand-300">
                {months} months of Pro
              </p>
              <p className="mt-1 text-xs text-white/50">
                Unlimited parties, playlists, bumpers, and more
              </p>
            </div>

            {/* Invite code display */}
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-wider text-white/30">
                Invite code
              </p>
              <p className="font-mono text-2xl font-bold tracking-[0.15em] text-brand-400">
                {invite.code}
              </p>
            </div>

            {/* Action area */}
            {!invite.valid ? (
              <div className="rounded-lg bg-red-900/20 px-4 py-3 text-center text-sm text-red-300">
                {invite.expired
                  ? "This invite has expired."
                  : "This invite has already been claimed."}
              </div>
            ) : !user ? (
              <div className="space-y-3">
                <p className="text-center text-sm text-white/60">
                  Sign in with Google to claim your invite
                </p>
                {CLIENT_ID ? (
                  <GoogleSignInButton
                    clientId={CLIENT_ID}
                    onSignedIn={onSignedIn}
                  />
                ) : (
                  <p className="text-center text-xs text-red-400">
                    Google sign-in not configured
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2">
                  {user.picture ? (
                    <img
                      src={user.picture}
                      alt=""
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-bold">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="text-sm">
                    <p className="font-medium">{user.name}</p>
                    <p className="text-xs text-white/50">{user.email}</p>
                  </div>
                </div>
                <button
                  onClick={redeem}
                  disabled={redeeming}
                  className="btn-primary w-full py-3 text-base"
                >
                  {redeeming
                    ? "Activating..."
                    : `Claim ${months} months of Pro`}
                </button>
              </div>
            )}

            {error && (
              <p className="text-center text-sm text-red-400">{error}</p>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-white/30">
          Jukebox — Your party&apos;s group playlist, live from YouTube.
        </p>
      </div>
    </main>
  );
}
