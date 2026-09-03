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
  setVolume: (v: number) => void;
  getVolume: () => number;
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

// Starting volume for a fresh visitor (0-100). Leaves headroom so the host
// can turn it up on a big system rather than starting pinned at max.
const DEFAULT_VOLUME = 75;

// Phones/tablets are guest devices — the sound comes from the host's system,
// so we start muted there and only unmute on an explicit request (tapping the
// sound badge, the slider, or M). Desktop keeps the auto-unmute behaviour.
// Combines a UA check with a coarse-pointer/touch check so it also catches
// iPadOS, which reports a desktop UA.
function detectMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    if (/Android|iPhone|iPod|iPad|Windows Phone|webOS|BlackBerry|Opera Mini|Mobile/i.test(ua)) {
      return true;
    }
    // iPadOS 13+ masquerades as macOS; touch points give it away.
    if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true;
    // Fallback: touch-primary device with no fine pointer.
    return (
      window.matchMedia?.("(pointer: coarse)").matches === true &&
      window.matchMedia?.("(hover: none)").matches === true
    );
  } catch {
    return false;
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
  // When the current video was (re)loaded. For a short window afterward
  // getCurrentTime()/getDuration() can still report the PREVIOUS video's
  // near-end values — the early-end poll must ignore that window or it will
  // instantly "end" every freshly-loaded song and blow through the playlist.
  const loadedAtRef = useRef(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  const onPlaybackErrorRef = useRef(onPlaybackError);
  onPlaybackErrorRef.current = onPlaybackError;
  const [needsTap, setNeedsTap] = useState(false);
  // True while the video is playing but muted because Chrome blocked
  // autoplay-with-sound. Any interaction clears it (see the gesture effect).
  const [isMutedNow, setIsMutedNow] = useState(false);
  // Set once the user has interacted, so later songs start unmuted directly.
  const soundUnlockedRef = useRef(false);
  // Mobile guests default to muted (host's system carries the audio). Detected
  // after mount so SSR and first paint stay consistent.
  const isMobileRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const m = detectMobile();
    isMobileRef.current = m;
    setIsMobile(m);
    if (m) setIsMutedNow(true);
  }, []);
  // Volume 0-100. Persisted so it survives reloads / song changes; a saved
  // preference overrides the default on mount.
  const [volume, setVolumeState] = useState(DEFAULT_VOLUME);
  const volumeRef = useRef(DEFAULT_VOLUME);
  // Briefly shown volume HUD after a change.
  const [volumeFlash, setVolumeFlash] = useState(false);
  const volumeFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep playback active when app goes to background on mobile
  useBackgroundAudio(song, playerRef, partyName);

  // Background-tab keep-alive: browsers throttle (and can eventually freeze)
  // a hidden tab's timers, which is what stops the next song from ever
  // starting when this tab isn't focused — our end-of-song poll just stops
  // ticking. Browsers exempt a tab from that throttling while it's actually
  // producing audio, so we run a genuine (if effectively silent) Web Audio
  // signal for as long as a song is loaded. This is a well-established
  // pattern for exactly this class of background-tab problem.
  const keepAliveRef = useRef<{
    ctx: AudioContext;
    osc: OscillatorNode;
    gain: GainNode;
  } | null>(null);

  const startKeepAlive = useCallback(() => {
    if (keepAliveRef.current) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001; // a real signal, just effectively silent
      osc.frequency.value = 20; // near-inaudible even before the gain cut
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      keepAliveRef.current = { ctx, osc, gain };
      // Autoplay policy applies to AudioContexts too — this resume() is a
      // no-op if it's already running, and otherwise gets retried by the
      // gesture listener below the first time the page is interacted with.
      ctx.resume().catch(() => { /* needs a user gesture first */ });
    } catch { /* Web Audio unavailable */ }
  }, []);

  const stopKeepAlive = useCallback(() => {
    const ka = keepAliveRef.current;
    if (!ka) return;
    try {
      ka.osc.stop();
      ka.osc.disconnect();
      ka.gain.disconnect();
      ka.ctx.close();
    } catch { /* already torn down */ }
    keepAliveRef.current = null;
  }, []);

  useEffect(() => {
    if (song) startKeepAlive();
    else stopKeepAlive();
  }, [song, startKeepAlive, stopKeepAlive]);

  // Always torn down on unmount, regardless of what `song` was last.
  useEffect(() => stopKeepAlive, [stopKeepAlive]);

  // If the tab was backgrounded long enough that timer throttling delayed
  // (or the browser froze) our end-of-song poll, catch up the instant the
  // tab becomes visible again instead of waiting for the next tick — this
  // is what makes "I switched tabs and it never moved to the next song"
  // recoverable as soon as you switch back, even if the keep-alive audio
  // above didn't fully prevent throttling on a given browser.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const p = playerRef.current;
      const vid = currentVideoRef.current;
      if (!p || !vid || endHandledRef.current === vid) return;
      try {
        const state = p.getPlayerState();
        const dur = p.getDuration();
        const cur = p.getCurrentTime();
        const ended = state === 0 || (dur > 0 && cur > 0 && dur - cur <= 1.2);
        if (ended) {
          endHandledRef.current = vid;
          onEndedRef.current(vid);
        } else if (state === -1 || state === 2 || state === 5) {
          // Paused/stalled/unstarted while hidden — nudge it back to life.
          p.playVideo();
        }
      } catch { /* player not ready */ }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

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
              // Try with sound first. If Chrome blocks it, the watchdog
              // below falls back to muted playback so the video still
              // starts, and the first user gesture restores sound.
              try {
                e.target.setVolume(volumeRef.current);
                // Mobile guests start muted unless they've explicitly asked
                // for sound on this device.
                if (isMobileRef.current && !soundUnlockedRef.current) {
                  e.target.mute();
                } else if (soundUnlockedRef.current) {
                  e.target.unMute();
                }
              } catch { /* not ready */ }
              e.target.playVideo();
            },
            onStateChange: (e) => {
              // Only dismiss the "click for sound" prompt once we're actually
              // playing WITH sound — a muted auto-play shouldn't hide it.
              if (e.data === 1) {
                let muted = false;
                try { muted = e.target.isMuted(); } catch { /* not ready */ }
                if (!muted) setNeedsTap(false);
              }
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
        loadedAtRef.current = Date.now();

        // Poll the playhead and advance ~1.2s before the true end so the
        // end-screen recommendation grid never appears. Guarded by
        // endHandledRef so it fires once per song, and by loadedAtRef so a
        // just-loaded video's stale playhead can't trigger a false end.
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(() => {
          const p = playerRef.current;
          const vid = currentVideoRef.current;
          if (!p || !vid) return;
          // Give a freshly-loaded video time to reset its playhead before we
          // trust getCurrentTime()/getDuration().
          if (Date.now() - loadedAtRef.current < 2500) return;
          try {
            const dur = p.getDuration();
            const cur = p.getCurrentTime();
            if (
              dur > 0 &&
              cur > 0 &&
              dur - cur <= 1.2 &&
              endHandledRef.current !== vid
            ) {
              endHandledRef.current = vid;
              onEndedRef.current(vid);
            }
          } catch { /* player torn down */ }
        }, 500);

        // Autoplay watchdog. Chrome blocks autoplay-with-sound on a fresh
        // load, so if the video hasn't started after a beat we mute and
        // retry — muted autoplay is always permitted, so the video reliably
        // starts either way. We then track the mute state so the UI can
        // prompt for sound; the first user gesture unmutes (see below).
        let checks = 0;
        const watchdog = setInterval(() => {
          if (cancelled) { clearInterval(watchdog); return; }
          const p = playerRef.current;
          if (!p) { clearInterval(watchdog); return; }
          checks += 1;
          try {
            const st = p.getPlayerState();
            const stalled = st === -1 || st === 5;
            if (stalled) {
              // Not playing — the sound attempt was blocked. Mute so the
              // video can start; sound comes back on first interaction.
              if (!soundUnlockedRef.current) {
                p.mute();
                p.playVideo();
              } else {
                p.playVideo();
              }
            }
            let muted = false;
            try { muted = p.isMuted(); } catch { /* not ready */ }
            setIsMutedNow(muted && !soundUnlockedRef.current);
            setNeedsTap(stalled && checks > 4);
            // Done once it's playing — with sound, or intentionally muted on
            // a mobile guest device (there we wait for an explicit opt-in).
            if (
              !stalled &&
              (!muted || soundUnlockedRef.current || isMobileRef.current)
            ) {
              clearInterval(watchdog);
            }
          } catch { clearInterval(watchdog); }
          if (checks > 20) clearInterval(watchdog);
        }, 400);
      } else if (
        playerRef.current &&
        currentVideoRef.current !== song.videoId
      ) {
        playerRef.current.loadVideoById(song.videoId);
        // Carry sound + volume into the next song once the user has interacted.
        try { playerRef.current.setVolume(volumeRef.current); } catch { /* not ready */ }
        if (soundUnlockedRef.current) {
          try { playerRef.current.unMute(); } catch { /* not ready */ }
          setIsMutedNow(false);
        }
        playerRef.current.playVideo();
        currentVideoRef.current = song.videoId;
        loadedAtRef.current = Date.now();
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

  // Restore the saved volume on mount.
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("videojam:volume"));
      if (Number.isFinite(saved) && saved >= 0 && saved <= 100) {
        volumeRef.current = saved;
        setVolumeState(saved);
      }
    } catch { /* storage blocked */ }
  }, []);

  // Apply a new volume to the player, persist it, and flash the HUD.
  // Setting volume above 0 also unmutes, so the volume keys double as an
  // unmute gesture (they're a user interaction, which is what Chrome wants).
  const applyVolume = useCallback((next: number) => {
    const v = Math.max(0, Math.min(100, Math.round(next)));
    volumeRef.current = v;
    setVolumeState(v);
    try { localStorage.setItem("videojam:volume", String(v)); } catch { /* ignore */ }
    try {
      const p = playerRef.current;
      if (p) {
        p.setVolume(v);
        if (v > 0) {
          soundUnlockedRef.current = true;
          p.unMute();
          setIsMutedNow(false);
        } else {
          p.mute();
        }
      }
    } catch { /* not ready */ }
    setVolumeFlash(true);
    if (volumeFlashTimer.current) clearTimeout(volumeFlashTimer.current);
    volumeFlashTimer.current = setTimeout(() => setVolumeFlash(false), 1200);
  }, []);

  // Keyboard volume control: ↑/↓ (and +/-) adjust by 5, M toggles mute.
  // Ignored while typing in an input so it never hijacks the search box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") {
        e.preventDefault();
        applyVolume(volumeRef.current + 5);
      } else if (e.key === "ArrowDown" || e.key === "-" || e.key === "_") {
        e.preventDefault();
        applyVolume(volumeRef.current - 5);
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        try {
          const p = playerRef.current;
          if (!p) return;
          if (p.isMuted()) {
            soundUnlockedRef.current = true;
            p.unMute();
            if (volumeRef.current === 0) applyVolume(DEFAULT_VOLUME);
            setIsMutedNow(false);
          } else {
            p.mute();
            setIsMutedNow(true);
          }
          setVolumeFlash(true);
          if (volumeFlashTimer.current) clearTimeout(volumeFlashTimer.current);
          volumeFlashTimer.current = setTimeout(() => setVolumeFlash(false), 1200);
        } catch { /* not ready */ }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyVolume]);

  // Chrome requires a user gesture before audio can play. Listen for the
  // FIRST interaction anywhere on the page (click, tap, key, or scroll) and
  // use it to unmute — so the crowd gets sound the moment anyone touches the
  // page, without having to find a specific button. Runs in the capture
  // phase so the click-shield over the iframe can't swallow it.
  useEffect(() => {
    const unlock = () => {
      // Resume the keep-alive AudioContext — this is what actually gets it
      // running in browsers that require a gesture before any audio plays.
      try { keepAliveRef.current?.ctx.resume().catch(() => {}); } catch { /* ignore */ }
      // On phones/tablets we deliberately stay muted — a guest tapping around
      // the queue shouldn't start blasting audio next to the host's speakers.
      // They can still opt in via the sound badge, slider, or M key.
      if (isMobileRef.current) {
        try { playerRef.current?.playVideo(); } catch { /* not ready */ }
        setNeedsTap(false);
        return;
      }
      soundUnlockedRef.current = true;
      try {
        playerRef.current?.unMute();
        playerRef.current?.playVideo();
      } catch { /* not ready */ }
      setIsMutedNow(false);
      setNeedsTap(false);
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener("pointerdown", unlock, opts);
    window.addEventListener("touchstart", unlock, opts);
    window.addEventListener("keydown", unlock, opts);
    return () => {
      window.removeEventListener("pointerdown", unlock, opts);
      window.removeEventListener("touchstart", unlock, opts);
      window.removeEventListener("keydown", unlock, opts);
    };
  }, []);

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
              try {
                playerRef.current?.unMute();
                playerRef.current?.playVideo();
              } catch { /* destroyed */ }
              setNeedsTap(false);
            }}
          >
            <span className="text-4xl">🔊</span>
            <span className="text-sm font-medium text-white/80">
              Click for sound
            </span>
          </button>
        ) : null}
        {/* Playing but muted (Chrome blocked sound autoplay). Any click on
            the page restores sound; this just makes that discoverable. */}
        {song && isMutedNow && !needsTap ? (
          isMobile ? (
            // Mobile: an explicit opt-in button (we never auto-unmute here).
            <button
              type="button"
              onClick={() => {
                soundUnlockedRef.current = true;
                try {
                  playerRef.current?.unMute();
                  playerRef.current?.setVolume(volumeRef.current);
                  playerRef.current?.playVideo();
                } catch { /* not ready */ }
                setIsMutedNow(false);
              }}
              className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black"
            >
              <span className="text-base">🔇</span>
              <span>Tap for sound</span>
            </button>
          ) : (
            <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg backdrop-blur">
              <span className="text-base">🔇</span>
              <span>Click anywhere for sound</span>
            </div>
          )
        ) : null}
        {/* Volume HUD — flashes briefly after a keyboard/slider change. */}
        {song && volumeFlash ? (
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 items-center gap-3 rounded-xl bg-black/80 px-5 py-3 shadow-xl backdrop-blur">
            <span className="text-2xl">
              {isMutedNow || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
            </span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white transition-all"
                style={{ width: `${isMutedNow ? 0 : volume}%` }}
              />
            </div>
            <span className="w-10 text-right text-sm font-semibold text-white">
              {isMutedNow ? "Muted" : `${volume}%`}
            </span>
          </div>
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
          {/* Volume slider — keyboard (↑/↓, +/-, M) works anywhere too. */}
          <div
            className="hidden items-center gap-2 sm:flex"
            title="Volume — use ↑/↓ keys, or M to mute"
          >
            <span className="text-base leading-none">
              {isMutedNow || volume === 0 ? "🔇" : volume < 50 ? "🔉" : "🔊"}
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={isMutedNow ? 0 : volume}
              onChange={(e) => applyVolume(Number(e.target.value))}
              className="w-24 cursor-pointer accent-brand-500"
              aria-label="Volume"
            />
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
