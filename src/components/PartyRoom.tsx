"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AddSong from "./AddSong";
import Player from "./Player";
import QRCard from "./QRCard";
import Queue from "./Queue";
import { getAdminKey, getUserId } from "@/lib/identity";
import type { PublicParty, Song } from "@/lib/types";

export default function PartyRoom({ initial }: { initial: PublicParty }) {
  const [party, setParty] = useState<PublicParty>(initial);
  const [userId, setUserId] = useState("");
  const [adminKey, setAdmin] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(true);
  const partyRef = useRef(party);
  partyRef.current = party;

  useEffect(() => {
    setUserId(getUserId());
    setAdmin(getAdminKey(initial.code));
  }, [initial.code]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/party/${party.code}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as PublicParty;
        setParty(data);
      }
    } catch {
      /* ignore */
    }
  }, [party.code]);

  // Poll every 3s. Roadmap: swap for websockets / Supabase realtime.
  useEffect(() => {
    const id = setInterval(refresh, 3000);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  async function onVote(song: Song) {
    // optimistic
    setParty((p) => ({
      ...p,
      queue: p.queue
        .map((s) => {
          if (s.id !== song.id) return s;
          const has = s.votes.includes(userId);
          return {
            ...s,
            votes: has
              ? s.votes.filter((v) => v !== userId)
              : [...s.votes, userId],
          };
        })
        .sort((a, b) =>
          b.votes.length !== a.votes.length
            ? b.votes.length - a.votes.length
            : a.addedAt - b.addedAt,
        ),
    }));
    try {
      const res = await fetch(`/api/party/${party.code}/vote`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ songId: song.id, userId }),
      });
      if (res.ok) {
        const data = await res.json();
        setParty(data.party as PublicParty);
      } else {
        refresh();
      }
    } catch {
      refresh();
    }
  }

  async function onEnded(videoId: string) {
    try {
      const res = await fetch(`/api/party/${party.code}/ended`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ videoId }),
      });
      if (res.ok) {
        const data = await res.json();
        setParty(data.party as PublicParty);
      }
    } catch {
      refresh();
    }
  }

  async function onSkip() {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/party/${party.code}/admin`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ action: "skip" }),
      });
      if (res.ok) {
        const data = await res.json();
        setParty(data.party as PublicParty);
      }
    } catch {
      refresh();
    }
  }

  async function onRemove(song: Song) {
    if (!adminKey) return;
    const ok = confirm(`Remove "${song.title}" from the queue?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/party/${party.code}/admin`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ action: "remove", songId: song.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setParty(data.party as PublicParty);
      }
    } catch {
      refresh();
    }
  }

  const isAdmin = !!adminKey;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
          >
            Jukebox
          </Link>
          <h1 className="text-2xl font-bold md:text-3xl">{party.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
            <span className="chip">
              code <span className="font-mono text-white">{party.code}</span>
            </span>
            {isAdmin ? (
              <span className="chip bg-brand-600/30 text-brand-100">
                host
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-ghost"
            onClick={() => setShowQR((v) => !v)}
          >
            {showQR ? "Hide QR" : "Show QR"}
          </button>
          {isAdmin ? (
            <button
              className="btn-primary"
              onClick={onSkip}
              disabled={!party.nowPlaying}
              title="Skip current track"
            >
              Skip ▶▶
            </button>
          ) : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <Player song={party.nowPlaying} onEnded={onEnded} />
          <AddSong code={party.code} onAdded={setParty} />
          <div>
            <h2 className="mb-2 text-lg font-semibold">
              Up next{" "}
              <span className="text-sm font-normal text-white/50">
                · {party.queue.length}
              </span>
            </h2>
            <Queue
              party={party}
              userId={userId}
              isAdmin={isAdmin}
              onVote={onVote}
              onRemove={isAdmin ? onRemove : undefined}
            />
          </div>
        </section>
        {showQR ? (
          <aside className="space-y-4">
            <QRCard code={party.code} />
            {isAdmin ? (
              <div className="card p-4 text-sm text-white/70">
                <div className="mb-1 font-semibold text-white">
                  You&apos;re the host
                </div>
                <p>
                  Keep this tab open on the TV. Share the QR or the code{" "}
                  <span className="font-mono text-white">{party.code}</span>{" "}
                  with your friends so they can add songs.
                </p>
              </div>
            ) : null}
          </aside>
        ) : null}
      </div>
    </main>
  );
}
