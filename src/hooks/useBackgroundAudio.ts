"use client";

import { useEffect, useRef } from "react";
import type { Song } from "@/lib/types";

/**
 * Hook to keep party playback active even when the mobile app goes to background
 * or the screen locks. Enables:
 * - Playback continues when app loses focus
 * - Media controls show on lock screen
 * - Prevents accidental pause when screen is locked
 */
export function useBackgroundAudio(
  song: Song | null,
  playerRef: React.RefObject<any>,
  partyName: string,
) {
  const lastStateRef = useRef<number | null>(null);

  useEffect(() => {
    if (!song || !playerRef.current) return;

    // Setup Media Session API for lock screen controls
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.addedBy,
        artwork: [
          {
            src: song.thumbnail,
            sizes: "128x128",
            type: "image/jpeg",
          },
        ],
      });

      // Prevent the browser from pausing when media controls are used
      navigator.mediaSession.setActionHandler("play", () => {
        playerRef.current?.playVideo();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        // Note: don't actually pause — we want to keep playing
        // This prevents system pause commands from stopping the party
      });

      navigator.mediaSession.setActionHandler("stop", () => {
        // Don't stop on system stop command
      });
    }

    // Handle visibility changes — if page becomes visible, resume playback
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Page came back into focus — resume playback
        try {
          const state = playerRef.current?.getPlayerState?.();
          if (state === 2) {
            // Paused state
            playerRef.current.playVideo();
          }
        } catch {
          /* ignore */
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Prevent native pause on page hide (for some browsers)
    const handlePageHide = () => {
      try {
        lastStateRef.current = playerRef.current?.getPlayerState?.();
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pagehide", handlePageHide);

    // When page becomes visible again, restore playback
    const handlePageShow = () => {
      try {
        if (lastStateRef.current !== 0) {
          // If it wasn't finished, resume
          playerRef.current?.playVideo();
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pageshow", handlePageShow);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [song, playerRef, partyName]);
}
