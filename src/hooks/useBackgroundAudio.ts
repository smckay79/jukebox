"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Song } from "@/lib/types";

export function useBackgroundAudio(
  song: Song | null,
  playerRef: React.RefObject<any>,
  partyName: string,
) {
  const lastStateRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Request a screen wake lock to prevent the device from sleeping.
  // Wake locks are automatically released when the document becomes hidden,
  // so we call this on every visibility restore too.
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      // Battery saver mode or permission denied — non-fatal
    }
  }, []);

  // Acquire wake lock whenever a song is active
  useEffect(() => {
    if (!song) return;
    requestWakeLock();
  }, [song, requestWakeLock]);

  // Start a near-silent looping audio buffer on the first user gesture.
  // This registers the page with the iOS audio session, which makes the
  // Media Session lock-screen controls appear even when the YouTube iframe
  // is the actual audio source.
  useEffect(() => {
    if (!song) return;
    const start = async () => {
      if (audioCtxRef.current) return;
      try {
        const ctx = new AudioContext();
        await ctx.resume();
        const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 0.0001;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(ctx.destination);
        src.start();
        audioCtxRef.current = ctx;
      } catch {
        /* AudioContext unavailable */
      }
    };
    // pointerdown covers both mouse clicks and touch taps in one event
    window.addEventListener("pointerdown", start, { once: true });
    return () => window.removeEventListener("pointerdown", start);
  }, [song]);

  useEffect(() => {
    if (!song || !playerRef.current) return;

    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.addedBy,
        artwork: [{ src: song.thumbnail, sizes: "128x128", type: "image/jpeg" }],
      });

      navigator.mediaSession.setActionHandler("play", () => {
        playerRef.current?.playVideo();
      });
      // Override pause/stop so the system can't stop the party
      navigator.mediaSession.setActionHandler("pause", () => {});
      navigator.mediaSession.setActionHandler("stop", () => {});
    }

    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        // Wake lock is auto-released on hide — re-acquire it
        await requestWakeLock();
        try {
          if (playerRef.current?.getPlayerState?.() === 2) {
            playerRef.current.playVideo();
          }
        } catch {
          /* ignore */
        }
      }
    };

    const handlePageHide = () => {
      try {
        lastStateRef.current = playerRef.current?.getPlayerState?.();
      } catch {
        /* ignore */
      }
    };

    const handlePageShow = async () => {
      await requestWakeLock();
      try {
        if (lastStateRef.current !== 0) playerRef.current?.playVideo();
      } catch {
        /* ignore */
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [song, playerRef, requestWakeLock]);

  // Release everything on unmount
  useEffect(() => {
    return () => {
      wakeLockRef.current?.release().catch(() => {});
      audioCtxRef.current?.close().catch(() => {});
    };
  }, []);
}
