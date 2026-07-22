"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MiniQR from "./MiniQR";
import { useBackgroundAudio } from "@/hooks/useBackgroundAudio";
import type { Song } from "@/lib/types";

// Minimal typings for the YouTube IFrame API surface we use.
type YTPlayer = {
  loadVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  destroy: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
  getCurrentTime: () => number;
  getDuration: () => number;
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
  onPlaybackError,
  partyCode,
  fill,
  downvotes = 0,
  goldenSkip = false,
  onDownvote,
  onGoldenDownvote,
  canDownvote = false,
  hasDownvoted = false,
  isHost = false,
  partyName = "VideoJam Party",
  sponsorLogo,
}: {
  song: Song | null;
  onEnded: (videoId: string) => void;
  onPlaybackError?: (videoId: string, errorCode: number) => void;
  partyCode?: string;
  fill?: boolean;
  downvotes?: number;
  goldenSkip?: boolean;
  onDownvote?: () => void;
  onGoldenDownvote?: () => void;
  canDownvote?: boolean;
  hasDownvoted?: boolean;
  isHost?: boolean;
  partyName?: string;
  sponsorLogo?: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const currentVideoRef = useRef<string | null>(null);
  // Poll that ends the song a beat early so YouTube's end-screen
  // recommendation grid never gets a chance to render.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // videoId we've already advanced past, so the early-end poll and the
  // native "ended" event can't double-fire for the same song.
  const endHandledRef = useRef<string | null>(null);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlaybackErrorRef = useRef(onPlaybackError);
  onPlaybackErrorRef.current = onPlaybackError;
  const [needsTap, setNeedsTap] = useState(false);
  // Video is playing but was auto-muted because the browser blocked
  // autoplay-with-sound — we show a one-tap "unmute" prompt.
  const [needsUnmute, setNeedsUnmute] = useState(false);

  // Keep playback active when app goes to background on mobile
  useBackgroundAudio(song, playerRef, partyName);

  useEffect(() => {
    let cancelled = false;

    if (!song) {
      currentVideoRef.current = null;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
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
        setNeedsUnmute(false);
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
              if (
                e.data === 0 &&
                currentVideoRef.current &&
                endHandledRef.current !== currentVideoRef.current
              ) {
                endHandledRef.current = currentVideoRef.current;
                onEndedRef.current(currentVideoRef.current);
              }
            },
            onError: (e) => {
              // 100 = not found/private, 101/150 = embedding disabled, 5 = HTML5 error
              if (currentVideoRef.current) {
                onPlaybackErrorRef.current?.(currentVideoRef.current, e.data);
              }
            },
          },
        });
        currentVideoRef.current = song.videoId;

        // Poll the playhead and advance ~1.2s before the true end so the
        // end-screen recommendation grid never appears. Guarded by
        // endHandledRef so it fires once per song.
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => {
          const p = playerRef.current;
          const vid = currentVideoRef.current;
          if (!p || !vid) return;
          try {
            const dur = p.getDuration();
            const cur = p.getCurrentTime();
            if (
              dur > 0 &&
              dur - cur <= 1.2 &&
              endHandledRef.current !== vid
            ) {
              endHandledRef.current = vid;
              onEndedRef.current(vid);
            }
          } catch { /* player torn down */ }
        }, 500);

        // Check after a beat whether the browser blocked autoplay.
        // State -1 = unstarted, 5 = cued — both mean it didn't start.
        // Browsers block autoplay *with sound* on a fresh page load, so if
        // that happened we mute and retry — muted autoplay is always allowed
        // — and surface a one-tap "unmute" prompt instead of a dead
        // "click to play" screen. The video still starts on its own.
        setTimeout(() => {
          if (cancelled) return;
          try {
            const p = playerRef.current;
            if (!p) return;
            const st = p.getPlayerState();
            if (st === -1 || st === 5) {
              p.mute();
              p.playVideo();
              setNeedsUnmute(true);
              // If even muted playback didn't kick in, fall back to a tap.
              setTimeout(() => {
                if (cancelled) return;
                try {
                  const st2 = playerRef.current?.getPlayerState();
                  if (st2 === -1 || st2 === 5) {
                    setNeedsUnmute(false);
                    setNeedsTap(true);
                  }
                } catch { /* destroyed */ }
              }, 1200);
            }
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

  // Golden skip: after the animation plays (~2.2s), auto-advance the song.
  const goldenFired = useRef(false);
  const triggerSkip = useCallback(() => {
    if (song && !goldenFired.current) {
      goldenFired.current = true;
      onEnded(song.videoId);
    }
  }, [song, onEnded]);

  useEffect(() => {
    if (!goldenSkip || !song) { goldenFired.current = false; return; }
    const timer = setTimeout(triggerSkip, 2200);
    return () => clearTimeout(timer);
  }, [goldenSkip, song, triggerSkip]);

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
        {/* Transparent shield over the video: swallows clicks so YouTube's
            in-video info cards / end-screen teasers can't navigate away from
            the party. Sits below the play/unmute prompts (higher z) so those
            stay clickable. Playback is driven by our own controls anyway. */}
        {song ? <div className="absolute inset-0 z-[5]" aria-hidden /> : null}
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
        {/* Playing but muted (autoplay-with-sound was blocked) — one tap to
            turn the sound on. Non-blocking so the video plays behind it. */}
        {song && needsUnmute ? (
          <button
            type="button"
            className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black"
            onClick={() => {
              try {
                playerRef.current?.unMute();
                playerRef.current?.playVideo();
              } catch { /* destroyed */ }
              setNeedsUnmute(false);
            }}
          >
            <span className="text-base">🔊</span>
            <span>Tap for sound</span>
          </button>
        ) : null}
        {/* Golden skip overlay — dramatic full-screen golden X */}
        {song && goldenSkip ? (
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center overflow-hidden">
            <div className="absolute inset-0 bg-black/60" style={{ animation: "goldenFade 2.2s ease-out both" }} />
            <div
              className="relative flex items-center justify-center"
              style={{ animation: "goldenXIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both" }}
            >
              <div className="golden-x-glow absolute h-48 w-48 rounded-full md:h-72 md:w-72" style={{ animation: "goldenPulse 1s ease-in-out 0.3s infinite" }} />
              <div
                className="relative flex h-40 w-40 items-center justify-center rounded-2xl border-[6px] border-yellow-400 text-[8rem] font-black leading-none text-yellow-400 drop-shadow-[0_0_40px_rgba(250,204,21,0.8)] md:h-60 md:w-60 md:rounded-3xl md:border-8 md:text-[12rem]"
                style={{ textShadow: "0 0 60px rgba(250,204,21,0.6), 0 0 120px rgba(250,204,21,0.3)" }}
              >
                X
              </div>
            </div>
            <div className="absolute bottom-8 text-center" style={{ animation: "goldenTextIn 0.5s ease-out 0.4s both" }}>
              <div className="text-lg font-bold tracking-widest text-yellow-400 drop-shadow-lg md:text-2xl">
                GOLDEN DOWNVOTE
              </div>
            </div>
          </div>
        ) : null}
        {/* Downvote X marks overlay (regular crowd votes) */}
        {song && !goldenSkip && downvotes > 0 ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center gap-4">
            {Array.from({ length: Math.min(downvotes, 3) }).map((_, i) => (
              <div
                key={i}
                className="flex h-16 w-16 items-center justify-center rounded-xl border-4 border-red-500 bg-red-600/30 text-4xl font-black text-red-500 shadow-lg backdrop-blur-sm md:h-24 md:w-24 md:text-6xl"
                style={{
                  animation: "downvoteIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
                  animationDelay: `${i * 0.15}s`,
                }}
              >
                X
              </div>
            ))}
          </div>
        ) : null}
        {/* QR overlay so latecomers can scan straight off the TV. Pointer
            events disabled so it never steals clicks from the iframe. */}
        {song && partyCode ? (
          <div className="pointer-events-none absolute bottom-3 right-3 hidden md:block">
            <MiniQR code={partyCode} size={96} />
          </div>
        ) : null}
        {/* Sponsor logo — top-left corner, only in fill/TV mode */}
        {fill && sponsorLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={sponsorLogo}
            alt="Sponsor"
            className="pointer-events-none absolute left-3 top-3 z-10 h-14 max-w-[140px] rounded object-contain opacity-85 drop-shadow-lg"
          />
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
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{song.title}</div>
            <div className="text-xs text-white/50">
              Added by {song.addedBy}
            </div>
          </div>
          {isHost && onGoldenDownvote ? (
            <button
              type="button"
              onClick={onGoldenDownvote}
              className="rounded-lg bg-gradient-to-r from-yellow-500/30 to-amber-500/30 px-4 py-1.5 text-sm font-bold text-yellow-400 shadow-[0_0_12px_rgba(250,204,21,0.25)] transition hover:from-yellow-500/40 hover:to-amber-500/40 hover:shadow-[0_0_18px_rgba(250,204,21,0.4)]"
              title="Golden Downvote — instantly skips this song"
            >
              Golden Downvote
            </button>
          ) : onDownvote && canDownvote ? (
            <button
              type="button"
              onClick={onDownvote}
              disabled={hasDownvoted}
              className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                hasDownvoted
                  ? "bg-red-600/20 text-red-400"
                  : "bg-white/10 text-white/60 hover:bg-red-600/20 hover:text-red-400"
              }`}
              title={hasDownvoted ? "You voted to skip" : "Vote to skip this song"}
            >
              <span className="text-base">✕</span>
              <span>{downvotes}/3</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
