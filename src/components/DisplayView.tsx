"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Marquee from "./Marquee";
import MiniQR from "./MiniQR";
import Player from "./Player";
import type { PublicParty } from "@/lib/types";

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
          setParty(next);
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

  return (
    <div className="flex h-screen w-screen flex-col bg-black text-white">
      {/* Up-next strip pinned to the top. Always rendered (even when
          empty) so the layout doesn't shift when the queue drains. */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 bg-black/80 px-4">
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

      {/* Player fills the remaining vertical space. We don't pass
          partyCode here — Player would otherwise render its own 96px
          mini-QR overlay, and we want the bigger TV-sized one below. */}
      <div className="relative min-h-0 flex-1 bg-black">
        <Player song={party.nowPlaying} onEnded={onEnded} fill />
        {/* TV-sized join QR. 144px reads comfortably from across a room;
            the Player's built-in 96px version is fine for a web browser
            but too small for a TV across a living room. */}
        <div className="pointer-events-none absolute bottom-4 right-4">
          <MiniQR code={party.code} size={144} />
        </div>
      </div>

      {/* Marquee at the bottom — same text the host set for the web room. */}
      <div className="flex-shrink-0">
        <Marquee text={party.marquee} />
      </div>
    </div>
  );
}
