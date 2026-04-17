"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PublicUser } from "@/lib/types";

// Header pill that shows "Sign in" when logged out and the user's avatar
// + name with a dropdown when logged in. Fetches session state on mount
// and exposes the user to the parent (so e.g. ImportPlaylist can decide
// whether to show the "saved playlists" section).
export default function UserMenu({
  nextPath,
  onUserChange,
}: {
  // Path to return to after a /login round-trip. Usually the current party
  // URL so the user lands back where they were.
  nextPath: string;
  onUserChange?: (user: PublicUser | null) => void;
}) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) {
            setUser(null);
            setLoaded(true);
            onUserChange?.(null);
          }
          return;
        }
        const d = (await r.json()) as { user: PublicUser | null };
        if (!cancelled) {
          setUser(d.user);
          setLoaded(true);
          onUserChange?.(d.user);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setLoaded(true);
          onUserChange?.(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // onUserChange intentionally omitted — we only want the effect to run
    // once on mount. Callers should memoize if they need re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function signOut() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* ignore — we'll still clear local state */
    }
    setUser(null);
    setOpen(false);
    onUserChange?.(null);
  }

  if (!loaded) {
    // Avoid layout shift — reserve roughly the same width as the button.
    return <div className="h-8 w-20" aria-hidden />;
  }

  if (!user) {
    const href = `/login?next=${encodeURIComponent(nextPath)}`;
    return (
      <Link href={href} className="btn-ghost text-sm" title="Sign in with Google">
        Sign in
      </Link>
    );
  }

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-white/10 px-2 py-1 text-sm hover:bg-white/20"
        title={user.email}
      >
        {user.picture ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={user.picture}
            alt=""
            className="h-6 w-6 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold">
            {initial}
          </span>
        )}
        <span className="hidden max-w-[8rem] truncate sm:inline">
          {user.name.split(" ")[0]}
        </span>
        <span aria-hidden className="text-white/50">▾</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-white/10 bg-[#120a1f] p-2 shadow-xl">
          <div className="border-b border-white/10 px-2 py-1.5 text-xs">
            <div className="truncate font-medium">{user.name}</div>
            <div className="truncate text-white/50">{user.email}</div>
          </div>
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="mt-1 flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-white/80 hover:bg-white/10"
          >
            <span>
              {user.subscription.tier === "pro"
                ? "Manage plan"
                : user.subscription.tier === "trial"
                  ? "Upgrade to Pro"
                  : "Upgrade to Pro"}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                user.subscription.tier === "pro"
                  ? "bg-emerald-600/30 text-emerald-300"
                  : user.subscription.tier === "trial"
                    ? "bg-brand-600/30 text-brand-300"
                    : "bg-white/10 text-white/40"
              }`}
            >
              {user.subscription.tier === "pro"
                ? "Pro"
                : user.subscription.tier === "trial"
                  ? "Trial"
                  : "Free"}
            </span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-white/80 hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
