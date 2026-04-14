"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AddSong from "./AddSong";
import Background from "./Background";
import BannedList from "./BannedList";
import ImportPlaylist from "./ImportPlaylist";
import Marquee from "./Marquee";
import NowPlayingCompact from "./NowPlayingCompact";
import Player from "./Player";
import QRCard from "./QRCard";
import Queue from "./Queue";
import SettingsMenu from "./SettingsMenu";
import { getAdminKey, getUserId } from "@/lib/identity";
import type { PartyTheme, PublicParty, Song } from "@/lib/types";

export default function PartyRoom({ initial }: { initial: PublicParty }) {
  const [party, setParty] = useState<PublicParty>(initial);
  const [userId, setUserId] = useState("");
  const [adminKey, setAdmin] = useState<string | null>(null);
  // QR is for inviting friends; hide by default on mobile (where the guest
  // already joined), and let hosts show it explicitly on the TV tab.
  const [showQR, setShowQR] = useState(false);
  // Presenter / fullscreen mode — triggered by the host for TV casting.
  // We fullscreen only the player-cluster (video + QR overlay + up-next
  // strip + marquee) instead of the whole document so the iframe never
  // needs to remount.
  const presenterRef = useRef<HTMLDivElement | null>(null);
  const [presenterMode, setPresenterMode] = useState(false);
  const partyRef = useRef(party);
  partyRef.current = party;

  useEffect(() => {
    const onFs = () => {
      setPresenterMode(
        !!document.fullscreenElement &&
          document.fullscreenElement === presenterRef.current,
      );
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function enterPresenter() {
    const el = presenterRef.current;
    if (!el || !el.requestFullscreen) return;
    try {
      await el.requestFullscreen();
    } catch {
      /* user dismissed or browser blocked — nothing to do */
    }
  }

  async function exitPresenter() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }

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

  // Real-time updates via Server-Sent Events; the server pushes a new
  // `PublicParty` payload on every write. EventSource auto-reconnects on
  // connection drop (e.g. when Vercel cuts the function at its max
  // duration). A slow 30s poll runs alongside as a safety net in case
  // Redis pub/sub is unavailable or a publish is dropped.
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      try {
        es = new EventSource(`/api/party/${party.code}/stream`);
      } catch {
        return;
      }
      es.onmessage = (ev) => {
        try {
          const next = JSON.parse(ev.data) as PublicParty;
          setParty(next);
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        // Browser will auto-retry, but close to be explicit if something
        // went wrong server-side and let it reopen cleanly.
        es?.close();
        es = null;
        if (!cancelled) setTimeout(open, 2000);
      };
    };
    open();

    const poll = setInterval(refresh, 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      es?.close();
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [party.code, refresh]);

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
    // Optimistically advance the local party state so the Player loads the
    // next song immediately — before the server round-trip — cutting the
    // window in which YouTube shows its "more videos" end screen to near
    // zero. The server response below is authoritative and will correct
    // anything that raced with a concurrent admin action.
    setParty((p) => {
      if (!p.nowPlaying || p.nowPlaying.videoId !== videoId) return p;
      const sorted = [...p.queue].sort((a, b) =>
        b.votes.length !== a.votes.length
          ? b.votes.length - a.votes.length
          : a.addedAt - b.addedAt,
      );
      const next = sorted[0] ?? null;
      return {
        ...p,
        nowPlaying: next,
        queue: next ? p.queue.filter((s) => s.id !== next.id) : p.queue,
      };
    });
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

  // All admin actions funnel through a single POST to /admin. We return the
  // error message (if any) so BannedList can surface "couldn't parse URL".
  const adminPost = useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      if (!adminKey) return "Not authorized";
      try {
        const res = await fetch(`/api/party/${party.code}/admin`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return (data as { error?: string }).error ?? "Action failed";
        }
        if (data.party) setParty(data.party as PublicParty);
        return null;
      } catch {
        refresh();
        return "Network error";
      }
    },
    [adminKey, party.code, refresh],
  );

  async function onSkip() {
    await adminPost({ action: "skip" });
  }

  async function onRemove(song: Song) {
    const ok = confirm(`Remove "${song.title}" from the queue?`);
    if (!ok) return;
    await adminPost({ action: "remove", songId: song.id });
  }

  async function onBan(song: Song) {
    const ok = confirm(
      `Ban "${song.title}"? It will be removed from the queue and blocked from being added again.`,
    );
    if (!ok) return;
    await adminPost({
      action: "ban",
      videoId: song.videoId,
      title: song.title,
      thumbnail: song.thumbnail,
    });
  }

  async function onUnban(videoId: string) {
    await adminPost({ action: "unban", videoId });
  }

  async function onBanUrl(raw: string): Promise<string | null> {
    return adminPost({ action: "ban", url: raw });
  }

  async function onSetTheme(theme: PartyTheme | null): Promise<string | null> {
    return adminPost({ action: "theme", theme });
  }

  async function onSetMarquee(text: string): Promise<string | null> {
    return adminPost({ action: "marquee", marquee: text });
  }

  const isAdmin = !!adminKey;

  const bannedIds = useMemo(
    () => new Set(party.banned.map((b) => b.videoId)),
    [party.banned],
  );

  const queuedIds = useMemo(() => {
    const s = new Set(party.queue.map((q) => q.videoId));
    if (party.nowPlaying) s.add(party.nowPlaying.videoId);
    return s;
  }, [party.queue, party.nowPlaying]);

  return (
    <>
      <Background theme={party.theme} />
      <main className="mx-auto max-w-6xl px-4 py-4 md:py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3 md:mb-6">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
          >
            Jukebox
          </Link>
          <h1 className="truncate text-xl font-bold md:text-3xl">
            {party.name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/60">
            <span className="chip">
              code <span className="font-mono text-white">{party.code}</span>
            </span>
            {isAdmin ? (
              <span className="chip bg-brand-600/30 text-brand-100">host</span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost text-sm"
            onClick={() => setShowQR((v) => !v)}
          >
            {showQR ? "Hide QR" : "Show QR"}
          </button>
          {isAdmin ? (
            <SettingsMenu
              theme={party.theme}
              marquee={party.marquee}
              onSetTheme={onSetTheme}
              onSetMarquee={onSetMarquee}
            />
          ) : null}
        </div>
      </header>

      {/* Mobile: compact now-playing up top, then search, then queue. */}
      <div className="space-y-4 md:hidden">
        <NowPlayingCompact
          song={party.nowPlaying}
          isAdmin={isAdmin}
          onSkip={onSkip}
          onBan={onBan}
        />
        <Marquee text={party.marquee} />
        <AddSong
          code={party.code}
          onAdded={setParty}
          bannedIds={bannedIds}
        />
        <ImportPlaylist
          code={party.code}
          bannedIds={bannedIds}
          queuedIds={queuedIds}
          onImported={setParty}
        />
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
            onBan={isAdmin ? onBan : undefined}
          />
        </div>
        {showQR ? <QRCard code={party.code} /> : null}
        {isAdmin ? (
          <BannedList
            banned={party.banned}
            onUnban={onUnban}
            onBanUrl={onBanUrl}
          />
        ) : null}
      </div>

      {/* Desktop/TV: search at top (dropdown overlays the video below), then
          full player, then queue. Side column collapses when QR is hidden so
          the video can fill the width — ideal for casting to a TV. */}
      <div
        className={
          "hidden gap-6 md:grid " +
          (showQR ? "md:grid-cols-[1fr_360px]" : "md:grid-cols-1")
        }
      >
        <section className="space-y-4">
          <AddSong
            code={party.code}
            onAdded={setParty}
            bannedIds={bannedIds}
          />
          <ImportPlaylist
            code={party.code}
            bannedIds={bannedIds}
            queuedIds={queuedIds}
            onImported={setParty}
          />
          <div
            ref={presenterRef}
            className={
              presenterMode
                ? "flex h-full w-full flex-col bg-black"
                : "space-y-3"
            }
          >
            <div
              className={
                presenterMode
                  ? "relative min-h-0 flex-1 bg-black"
                  : ""
              }
            >
              <Player
                song={party.nowPlaying}
                onEnded={onEnded}
                partyCode={party.code}
                fill={presenterMode}
              />
            </div>

            {/* Compact up-next strip shown only while fullscreened so the
                crowd can see what's queued without the full queue list. */}
            {presenterMode && party.queue[0] ? (
              <div className="flex items-center gap-3 bg-black/80 px-4 py-2 text-white">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                  Up next
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={party.queue[0].thumbnail}
                  alt=""
                  className="h-8 w-14 flex-shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1 truncate">
                  {party.queue[0].title}
                </div>
                <span className="flex-shrink-0 text-xs text-white/50">
                  Added by {party.queue[0].addedBy}
                </span>
              </div>
            ) : null}

            <Marquee text={party.marquee} />

            <div
              className={
                presenterMode
                  ? "flex items-center justify-center gap-2 bg-black/80 py-2"
                  : "flex gap-2"
              }
            >
              {!presenterMode ? (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={enterPresenter}
                  title="Expand the video to fill the screen (Esc to exit)"
                >
                  <span aria-hidden>⛶</span> Fullscreen
                </button>
              ) : (
                <>
                  {isAdmin ? (
                    <button
                      type="button"
                      className="btn-primary !px-3 !py-1.5 text-sm"
                      onClick={onSkip}
                      disabled={!party.nowPlaying}
                      title="Skip current track"
                    >
                      Skip ▶▶
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1.5 text-sm"
                    onClick={exitPresenter}
                  >
                    Exit fullscreen
                  </button>
                </>
              )}
            </div>
          </div>
          {isAdmin ? (
            <div className="flex justify-end">
              <button
                className="btn-primary"
                onClick={onSkip}
                disabled={!party.nowPlaying}
                title="Skip current track"
              >
                Skip ▶▶
              </button>
            </div>
          ) : null}
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
              onBan={isAdmin ? onBan : undefined}
            />
          </div>
          {/* When QR is hidden the admin tools move inline below the queue
              instead of sitting in a side column. */}
          {!showQR && isAdmin ? (
            <BannedList
              banned={party.banned}
              onUnban={onUnban}
              onBanUrl={onBanUrl}
            />
          ) : null}
        </section>
        {showQR ? (
          <aside className="space-y-4">
            <QRCard code={party.code} />
            {isAdmin ? (
              <>
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
                <BannedList
                  banned={party.banned}
                  onUnban={onUnban}
                  onBanUrl={onBanUrl}
                />
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
      </main>
    </>
  );
}
