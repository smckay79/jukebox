"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  getDisplayName,
  setAdminKey,
  setAdminPin,
  setDisplayName,
} from "@/lib/identity";
import type { PublicUser } from "@/lib/types";

const THEME_OPTIONS = [
  { label: "Dance / Electronic", era: "80s", genre: "electronic" },
  { label: "Rock / Metal", era: "90s", genre: "rock" },
  { label: "Hip-Hop / R&B", era: "2000s", genre: "hiphop" },
  { label: "Pop Hits", era: "2010s", genre: "pop" },
  { label: "Country / Chill", era: "70s", genre: "country" },
  { label: "Indie / Alternative", era: "2010s", genre: "indie" },
  { label: "Retro / Disco", era: "70s", genre: "rnb" },
  { label: "Vaporwave / Lofi", era: "2020s", genre: "electronic" },
] as const;

export default function CreatePartyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [themeIdx, setThemeIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [authLoaded, setAuthLoaded] = useState(false);

  useEffect(() => {
    const saved = getDisplayName();
    if (saved) setHost(saved);
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const u = d?.user as PublicUser | null ?? null;
        setUser(u);
        if (u && !saved) setHost(u.name.split(" ")[0]);
        setAuthLoaded(true);
      })
      .catch(() => setAuthLoaded(true));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const theme =
        themeIdx !== null
          ? {
              era: THEME_OPTIONS[themeIdx].era,
              genre: THEME_OPTIONS[themeIdx].genre,
              seed: Math.floor(Math.random() * 100000),
            }
          : undefined;
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, theme }),
      });
      if (res.status === 401) {
        setError("Please sign in to start a party.");
        setUser(null);
        return;
      }
      if (!res.ok) {
        setError("Couldn't create the party. Try again?");
        return;
      }
      const data = (await res.json()) as {
        code: string;
        adminKey: string;
        adminPin: string;
        name: string;
      };
      setAdminKey(data.code, data.adminKey);
      if (data.adminPin) setAdminPin(data.code, data.adminPin);
      if (host.trim()) setDisplayName(host.trim());
      router.push(`/party/${data.code}?host=1`);
    } finally {
      setBusy(false);
    }
  }

  if (!authLoaded) {
    return <div className="h-40 animate-pulse rounded-lg bg-white/5" />;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <p className="text-sm text-white/60">
          Sign in to start a party
        </p>
        <Link
          href="/login?next=/"
          className="btn-primary inline-block px-6"
        >
          Sign in with Google
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-white/70">Party name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex's birthday"
          className="input"
          maxLength={60}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-white/70">Your name (host)</span>
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="DJ Alex"
          className="input"
          maxLength={40}
        />
      </label>
      <fieldset>
        <legend className="mb-1 block text-sm text-white/70">
          What&apos;s the vibe?
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {THEME_OPTIONS.map((t, i) => (
            <button
              key={t.label}
              type="button"
              onClick={() => setThemeIdx(themeIdx === i ? null : i)}
              className={
                "rounded-lg border px-3 py-2 text-left text-sm transition " +
                (themeIdx === i
                  ? "border-brand-500 bg-brand-600/30 text-white"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Spinning up…" : "Start party"}
      </button>
    </form>
  );
}
