"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GoogleOAuth2TokenClient = {
  requestAccessToken: () => void;
};

type GoogleOAuth2 = {
  initTokenClient: (opts: {
    client_id: string;
    scope: string;
    callback: (resp: { access_token?: string; error?: string }) => void;
  }) => GoogleOAuth2TokenClient;
};

function getOAuth2(): GoogleOAuth2 | undefined {
  return (
    window as unknown as {
      google?: { accounts?: { oauth2?: GoogleOAuth2 } };
    }
  ).google?.accounts?.oauth2;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const YT_SCOPE = "https://www.googleapis.com/auth/youtube";

let gsiLoaded: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if (getOAuth2()) return Promise.resolve();
  if (gsiLoaded) return gsiLoaded;
  gsiLoaded = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[src*="accounts.google.com/gsi/client"]',
    );
    if (existing) {
      const check = () => {
        if (getOAuth2()) resolve();
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject();
    document.head.appendChild(s);
  });
  return gsiLoaded;
}

export default function ExportPlaylist({
  code,
  adminKey,
  songCount,
}: {
  code: string;
  adminKey: string;
  songCount: number;
}) {
  const [status, setStatus] = useState<
    "idle" | "loading" | "authorizing" | "creating" | "done" | "error"
  >("idle");
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const clientRef = useRef<GoogleOAuth2TokenClient | null>(null);

  const createPlaylist = useCallback(
    async (accessToken: string) => {
      setStatus("creating");
      try {
        const res = await fetch(`/api/party/${code}/export-playlist`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-key": adminKey,
          },
          body: JSON.stringify({ accessToken }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || "Failed to create playlist");
          setStatus("error");
          return;
        }
        setPlaylistUrl(data.playlistUrl);
        setAdded(data.added);
        setStatus("done");
      } catch {
        setErrorMsg("Network error");
        setStatus("error");
      }
    },
    [code, adminKey],
  );

  useEffect(() => {
    if (!CLIENT_ID) return;
    loadGsi()
      .then(() => {
        const oauth2 = getOAuth2();
        if (!oauth2) return;
        clientRef.current = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: YT_SCOPE,
          callback: (resp) => {
            if (resp.error || !resp.access_token) {
              setErrorMsg("YouTube authorization cancelled");
              setStatus("idle");
              return;
            }
            createPlaylist(resp.access_token);
          },
        });
      })
      .catch(() => {});
  }, [createPlaylist]);

  function handleExport() {
    if (!clientRef.current) {
      setErrorMsg("Google sign-in not available");
      return;
    }
    setStatus("authorizing");
    setErrorMsg(null);
    clientRef.current.requestAccessToken();
  }

  if (songCount === 0) return null;

  if (status === "done" && playlistUrl) {
    const tuneMyMusicUrl = `https://www.tunemymusic.com/?source=youtube&url=${encodeURIComponent(playlistUrl)}`;

    return (
      <div className="card space-y-3 p-4">
        <div className="flex items-center gap-2 text-emerald-400">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 16 0Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold">
            Playlist created! ({added} tracks)
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 14.5v-9l6 4.5-6 4.5Z" />
            </svg>
            Open on YouTube
          </a>
          <a
            href={tuneMyMusicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
          >
            Convert to Spotify / Apple Music
          </a>
        </div>

        <p className="text-xs text-white/40">
          Use TuneMyMusic to transfer this playlist to Spotify, Apple
          Music, Tidal, or 20+ other platforms.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <button
        onClick={handleExport}
        disabled={status !== "idle" && status !== "error"}
        className="btn-primary inline-flex w-full items-center justify-center gap-2 py-2.5 text-sm"
      >
        {status === "loading" || status === "authorizing" ? (
          "Authorizing YouTube…"
        ) : status === "creating" ? (
          "Creating playlist…"
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm-2 14.5v-9l6 4.5-6 4.5Z" />
            </svg>
            Export {songCount} tracks to YouTube Playlist
          </>
        )}
      </button>
      {errorMsg ? (
        <p className="mt-2 text-center text-xs text-red-400">{errorMsg}</p>
      ) : (
        <p className="mt-2 text-center text-xs text-white/40">
          Creates an unlisted playlist on your YouTube account.
          Then convert to Spotify or Apple Music with one click.
        </p>
      )}
    </div>
  );
}
