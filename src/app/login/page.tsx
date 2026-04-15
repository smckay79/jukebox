"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import GoogleSignInButton from "@/components/GoogleSignInButton";
import type { PublicUser } from "@/lib/types";

// The Google Client ID has to be available to the client, so it needs the
// NEXT_PUBLIC_ prefix. Read once at module load — env vars are inlined at
// build time for the NEXT_PUBLIC_ namespace.
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

// Inner component wrapped in Suspense because useSearchParams requires it
// on the app router during pre-rendering.
function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const onSignedIn = useCallback(
    (_user: PublicUser) => {
      // Small timeout lets the cookie write settle before navigation so a
      // `fetch('/api/auth/me')` on the destination page sees it.
      setTimeout(() => router.replace(next), 50);
    },
    [router, next],
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4">
      <div className="card w-full space-y-5 p-6 text-center">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
          >
            Jukebox
          </Link>
          <h1 className="mt-1 text-2xl font-bold">Sign in</h1>
          <p className="mt-2 text-sm text-white/60">
            Sign in with Google to save playlists and reuse them across
            parties. You don&apos;t need an account to join a party or queue
            songs.
          </p>
        </div>
        {CLIENT_ID ? (
          <GoogleSignInButton clientId={CLIENT_ID} onSignedIn={onSignedIn} />
        ) : (
          <p className="text-sm text-red-400">
            Google sign-in isn&apos;t configured on this server
            (missing&nbsp;
            <code className="font-mono text-xs">
              NEXT_PUBLIC_GOOGLE_CLIENT_ID
            </code>
            ).
          </p>
        )}
        <p className="text-xs text-white/40">
          We only store your Google profile (name, email, picture) and any
          playlists you choose to save.
        </p>
        <div className="text-xs">
          <Link href={next} className="text-white/70 hover:text-white">
            ← Back
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
