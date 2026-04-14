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
}: {
  song: Song | null;
  onEnded: (videoId: string) => void;
  partyCode?: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    let cancelled = false;
    if (!song) {
      playerRef.current?.destroy();
      playerRef.current = null;
      currentVideoRef.current = null;
      return;
    }

    loadYouTubeApi().then(() => {
      if (cancelled) return;
      if (!playerRef.current && mountRef.current && window.YT) {
        playerRef.current = new window.YT.Player(mountRef.current, {
          videoId: song.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
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
    <div className="card overflow-hidden">
      <div className="relative aspect-video w-full bg-black">
        {song ? (
          <div ref={mountRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-white/40">
            Nothing playing — add a song to get started.
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
      {song ? (
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
