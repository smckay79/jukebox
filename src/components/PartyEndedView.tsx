"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/recap";
import type { PartyRecap } from "@/lib/types";

// Rendered in place of PartyRoom when party.endedAt is set. Everyone
// (host + guests) sees a recap view — the host additionally sees any
// admin-specific status (saved playlist id, email delivery result).
//
// If the viewer arrived after the party ended (fresh load, no local
// recap in memory), we fetch the recap by replaying the end endpoint
// — idempotent by design.
export default function PartyEndedView({
  code,
  name,
  initialRecap,
  adminKey,
}: {
  code: string;
  name: string;
  initialRecap: PartyRecap | null;
  // Only the host has this. When null we just show the recap (no
  // admin-only delivery status).
  adminKey: string | null;
}) {
  const [recap, setRecap] = useState<PartyRecap | null>(initialRecap);
  const [loading, setLoading] = useState(initialRecap === null);
  const [error, setError] = useState<string | null>(null);

  // Fetch recap if we don't have one (e.g. guest reloaded the page).
  // The /end endpoint is admin-gated, so guests just see a shorter
  // "Party ended" screen without the song list.
  useEffect(() => {
    if (recap !== null) return;
    if (!adminKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/party/${code}/end`, {
          method: "POST",
          headers: { "x-admin-key": adminKey },
        });
        if (!res.ok) {
          if (!cancelled) setError("Couldn't load recap");
          return;
        }
        const data = (await res.json()) as { recap: PartyRecap };
        if (!cancelled) setRecap(data.recap);
      } catch {
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, recap, adminKey]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <Link href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-web.png" alt="VideoJam" className="h-6" />
        </Link>
        <h1 className="mt-1 text-3xl font-bold">{name}</h1>
        <div className="mt-1 text-sm text-white/60">
          This party has ended — thanks for coming!
        </div>
      </header>

      {loading ? (
        <p className="text-sm text-white/60">Loading recap…</p>
      ) : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {recap ? <Recap recap={recap} isHost={!!adminKey} /> : null}

      {!recap && !loading ? (
        <div className="card p-4 text-sm text-white/70">
          <p>
            The host ended this jam. The full recap is only visible to
            them.
          </p>
        </div>
      ) : null}

      <div className="mt-6 text-sm">
        <Link href="/" className="text-white/70 hover:text-white">
          ← Start another party
        </Link>
      </div>
    </main>
  );
}

function Recap({ recap, isHost }: { recap: PartyRecap; isHost: boolean }) {
  const durationMs = recap.endedAt - recap.startedAt;
  const elapsedHrs = Math.max(0, Math.floor(durationMs / 3_600_000));
  const elapsedMins = Math.max(
    0,
    Math.floor((durationMs % 3_600_000) / 60_000),
  );
  const elapsed =
    elapsedHrs > 0 ? `${elapsedHrs}h ${elapsedMins}m` : `${elapsedMins}m`;

  return (
    <div className="space-y-6">
      <div className="card grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
        <Stat label="Songs played" value={String(recap.totalPlayed)} />
        <Stat label="Time elapsed" value={elapsed} />
        <Stat
          label="Music played"
          value={formatDuration(recap.totalSeconds)}
        />
        <Stat
          label="Unique fans"
          value={String(recap.topRequesters.length)}
        />
      </div>

      {isHost ? <HostStatusPanel recap={recap} /> : null}

      <section>
        <h2 className="mb-2 text-lg font-semibold">Top requesters</h2>
        {recap.topRequesters.length === 0 ? (
          <p className="text-sm text-white/60">No song requests this party.</p>
        ) : (
          <ol className="card divide-y divide-white/10 p-0 text-sm">
            {recap.topRequesters.map((r, i) => (
              <li
                key={r.userId}
                className="flex items-center justify-between px-4 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-right font-mono text-white/40">
                    {i + 1}
                  </span>
                  <span>{r.name}</span>
                </div>
                <span className="text-white/60">
                  {r.count} song{r.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">What played</h2>
        {recap.history.length === 0 ? (
          <p className="text-sm text-white/60">Nothing played this party.</p>
        ) : (
          <ul className="space-y-1">
            {recap.history.map((h, i) => (
              <li
                key={`${h.videoId}-${i}`}
                className="flex items-start gap-2 rounded bg-white/5 p-2 text-sm"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={h.thumbnail}
                  alt=""
                  className="h-10 w-16 flex-shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="break-words">{h.title}</div>
                  <div className="truncate text-xs text-white/50">
                    Added by {h.addedBy}
                  </div>
                </div>
                <div className="flex-shrink-0 text-xs font-mono text-white/50">
                  {typeof h.playedSeconds === "number"
                    ? formatDuration(h.playedSeconds)
                    : "—"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

function HostStatusPanel({ recap }: { recap: PartyRecap }) {
  const savedLine = recap.savedPlaylist?.ok
    ? `Saved ${recap.savedPlaylist.count} track${recap.savedPlaylist.count === 1 ? "" : "s"} to your account as "${recap.savedPlaylist.name}".`
    : recap.savedPlaylist
      ? `Couldn't save a playlist copy (${recap.savedPlaylist.reason}).`
      : "Sign in next time to auto-save the played songs to your account.";

  const emailLine = recap.emailStatus?.ok
    ? `Recap emailed to ${recap.emailStatus.to}.`
    : recap.emailStatus
      ? recap.emailStatus.reason === "not-configured"
        ? "Email delivery isn't configured on this server (set RESEND_API_KEY to enable)."
        : `Couldn't email the recap (${recap.emailStatus.reason}).`
      : "Sign in next time to get a recap emailed to you.";

  return (
    <div className="card space-y-1 p-3 text-xs text-white/70">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Host delivery
      </div>
      <p>· {savedLine}</p>
      <p>· {emailLine}</p>
    </div>
  );
}
