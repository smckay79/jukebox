"use client";

import { useEffect, useRef } from "react";
import MiniQR from "./MiniQR";
import type { Song } from "@/lib/types";

// Minimal typings for the YouTube IFrame API surface we use.
type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
};

type YTPlayerOptions = {
  videoId?: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number; target: YTPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
};

type YTNamespace = {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReadyPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined")
    return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve();
  if (ytReadyPromise) return ytReadyPromise;

  ytReadyPromise = new Promise<void>((resolve) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytReadyPromise;
}

export default function Player({
  song,
  onEnded,
  partyCode,
  fill,
}: {
  song: Song | null;
  onEnded: (videoId: string) => void;
  partyCode?: string;
  // Edge-to-edge mode for presenter/fullscreen: drops the card chrome and
  // song-info footer and lets the video fill the parent.
  fill?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;

    if (!song) {
      currentVideoRef.current = null;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* detached iframe */ }
        playerRef.current = null;
      }
      return;
    }

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      if (!playerRef.current && wrapRef.current && window.YT) {
        // YouTube's Player() replaces the target element with an iframe,
        // so we create a fresh div each time instead of reusing the ref.
        wrapRef.current.textContent = "";
        const mount = document.createElement("div");
        wrapRef.current.appendChild(mount);

        playerRef.current = new window.YT.Player(mount, {
          videoId: song.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            cc_load_policy: 0,
            disablekb: 1,
            fs: 0,
          },
          events: {
            onStateChange: (e) => {
              if (e.data === 0 && currentVideoRef.current) {
                onEndedRef.current(currentVideoRef.current);
              }
            },
          },
        });
        currentVideoRef.current = song.videoId;
      } else if (
        playerRef.current &&
        currentVideoRef.current !== song.videoId
      ) {
        playerRef.current.loadVideoById(song.videoId);
        currentVideoRef.current = song.videoId;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [song]);

  return (
    <div
      className={
        fill ? "h-full w-full bg-black" : "card overflow-hidden"
      }
    >
      <div
        className={
          fill
            ? "relative h-full w-full bg-black"
            : "relative aspect-video w-full overflow-hidden bg-black"
        }
      >
        <div
          ref={wrapRef}
          className="yt-wrap absolute inset-0"
          style={song ? undefined : { display: "none" }}
        />
        {!song && (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            Waiting for the first banger…
          </div>
        )}
        {/* QR overlay so latecomers can scan straight off the TV. Pointer
            events disabled so it never steals clicks from the iframe. */}
        {song && partyCode ? (
          <div className="pointer-events-none absolute bottom-3 right-3 hidden md:block">
            <MiniQR code={partyCode} size={96} />
          </div>
        ) : null}
      </div>
      {!fill && song ? (
        <div className="flex items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={song.thumbnail}
            alt=""
            className="h-10 w-16 rounded object-cover"
          />
          <div className="min-w-0">
            <div className="truncate font-medium">{song.title}</div>
            <div className="text-xs text-white/50">
              Added by {song.addedBy}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
