"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Background from "./Background";
import Marquee from "./Marquee";
import MiniQR from "./MiniQR";
import Player from "./Player";
import SponsorDisplay from "./SponsorDisplay";
import { ERAS, GENRES, getQRBackgroundColor } from "@/lib/background";
import type { PartyTheme, PublicParty } from "@/lib/types";

// TV / Android / Fire TV "display" mode. Strips the host + guest chrome
// (no SettingsMenu, no ImportPlaylist, no QR cards, no AddSong) and
// lays out exactly what the crowd needs to see on a big screen:
//
//   • Full-bleed YouTube player
//   • "Up next" strip (first queued track) at the top
//   • Scrolling marquee at the bottom
//   • Always-on QR overlay baked into the player so latecomers can scan
//
// Meant to be embedded in a WebView (Android / Fire TV player app) or
// cast directly. The container assumes it's already fullscreen — we
// don't call requestFullscreen(), which wouldn't work in a WebView
// without a user gesture anyway.
//
// Consumes the same public endpoints as PartyRoom:
//   GET  /api/party/[code]              (initial state, passed in via SSR)
//   GET  /api/party/[code]/stream       (SSE updates)
//   POST /api/party/[code]/ended        (tell the server a video finished)
//
// No admin key, no auth, no writes other than "video ended" + the
// implicit "song ended" signal that advances the queue.
export default function DisplayView({ initial }: { initial: PublicParty }) {
  const [party, setParty] = useState<PublicParty>(initial);
  const partyRef = useRef(party);
  partyRef.current = party;
  // Stable random theme for when the party has no theme set
  const [fallbackTheme] = useState<PartyTheme>(() => ({
    era: ERAS[Math.floor(Math.random() * ERAS.length)].id,
    genre: GENRES[Math.floor(Math.random() * GENRES.length)].id,
    seed: Math.floor(Math.random() * 100000),
  }));

  const qrBg = useMemo(
    () => getQRBackgroundColor(party.theme),
    [party.theme],
  );

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

  // SSE subscription — same shape as PartyRoom's but without the admin
  // state sync. A 30s poll runs alongside as a safety net (same as the
  // main route) so the TV self-recovers if pub/sub dropped a message.
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
          // SSE updates don't include static fields like sponsors — preserve from prev state
          setParty((prev) => ({
            ...next,
            sponsors: next.sponsors ?? prev.sponsors,
          }));
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
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

  // Same optimistic-advance pattern as PartyRoom: pop the front of the
  // queue locally so the YouTube end-card doesn't linger, then tell the
  // server. The SSE echo reconciles any drift.
  const onEnded = useCallback(
    async (endedVideoId: string) => {
      const current = partyRef.current;
      if (!current.nowPlaying || current.nowPlaying.videoId !== endedVideoId) {
        return;
      }
      const [nextUp, ...rest] = current.queue;
      setParty({
        ...current,
        nowPlaying: nextUp ?? null,
        queue: rest,
      });
      try {
        const res = await fetch(`/api/party/${current.code}/ended`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoId: endedVideoId }),
        });
        if (res.ok) {
          const data = (await res.json()) as { party: PublicParty };
          setParty(data.party);
        }
      } catch {
        /* ignore — the SSE stream or the 30s poll will reconcile */
      }
    },
    [],
  );

  // Party was ended by the host. Show a terminal card instead of the
  // player; the Android app can detect this string / or the ended state
  // via the /api/party/<code> payload if it needs to react.
  if (party.endedAt) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-black text-white">
        <div className="text-sm uppercase tracking-widest text-white/50">
          Party ended
        </div>
        <div className="mt-2 text-3xl font-semibold">{party.name}</div>
      </div>
    );
  }

  const bgTheme = party.theme ?? fallbackTheme;

  return (
    <div className="relative flex h-screen w-screen flex-col text-white">
      {/* Procedural background — same system as the party room */}
      <Background theme={bgTheme} />
      {/* Up-next strip pinned to the top. Always rendered (even when
          empty) so the layout doesn't shift when the queue drains. */}
      <div className="relative flex h-12 flex-shrink-0 items-center gap-3 bg-black/80 px-4">
        {party.queue[0] ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Up next
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={party.queue[0].thumbnail}
              alt=""
              className="h-8 w-14 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1 truncate text-sm">
              {party.queue[0].title}
            </div>
            <span className="flex-shrink-0 text-xs text-white/50">
              Added by {party.queue[0].addedBy}
            </span>
          </>
        ) : (
          <span className="text-xs text-white/40">
            Queue is empty — scan the QR to add a song.
          </span>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <Player
          song={party.nowPlaying}
          onEnded={onEnded}
          fill
          downvotes={party.nowPlaying?.downvotes?.length ?? 0}
          goldenSkip={party.nowPlaying?.goldenSkip ?? false}
          partyName={party.name}
        />
        {/* Bottom gradient covers YouTube's end-screen cards/links so
            they're neither visible nor clickable on the TV display. */}
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />
        <div className="pointer-events-none absolute bottom-4 right-4">
          <MiniQR code={party.code} size={96} bgColor={qrBg} />
        </div>
        {/* Rotating sponsor logos — anchored to the bottom of the video,
            just above the marquee. */}
        <SponsorDisplay sponsors={party.sponsors} label={party.sponsorLabel} />
      </div>

      {/* Marquee at the bottom — same text the host set for the web room. */}
      <div className="relative flex-shrink-0">
        <Marquee text={party.marquee} />
      </div>
    </div>
  );
}
