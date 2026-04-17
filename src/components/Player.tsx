"use client";

import { useEffect, useRef, useState } from "react";
import MiniQR from "./MiniQR";
import type { Song } from "@/lib/types";

// Minimal typings for the YouTube IFrame API surface we use.
type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
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
  const [needsTap, setNeedsTap] = useState(false);

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

        setNeedsTap(false);
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
            onReady: (e) => {
              e.target.playVideo();
            },
            onStateChange: (e) => {
              if (e.data === 1) setNeedsTap(false);
              if (e.data === 0 && currentVideoRef.current) {
                onEndedRef.current(currentVideoRef.current);
              }
            },
          },
        });
        currentVideoRef.current = song.videoId;

        // Check after a beat whether the browser blocked autoplay.
        // State -1 = unstarted, 5 = cued — both mean it didn't start.
        setTimeout(() => {
          if (cancelled) return;
          try {
            const st = playerRef.current?.getPlayerState();
            if (st === -1 || st === 5) setNeedsTap(true);
          } catch { /* destroyed */ }
        }, 1500);
      } else if (
        playerRef.current &&
        currentVideoRef.current !== song.videoId
      ) {
        playerRef.current.loadVideoById(song.videoId);
        playerRef.current.playVideo();
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
        {song && needsTap ? (
          <button
            type="button"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/70 backdrop-blur-sm"
            onClick={() => {
              playerRef.current?.playVideo();
              setNeedsTap(false);
            }}
          >
            <span className="text-4xl">▶</span>
            <span className="text-sm font-medium text-white/80">
              Click to play
            </span>
          </button>
        ) : null}
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
