"use client";

import { useEffect, useRef, useState } from "react";
import { getDisplayName, getUserId, setDisplayName } from "@/lib/identity";
import type { PublicParty } from "@/lib/types";
import { parseYouTubeId } from "@/lib/youtube";

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
}

export default function AddSong({
  code,
  onAdded,
  bannedIds,
}: {
  code: string;
  onAdded: (party: PublicParty) => void;
  bannedIds?: Set<string>;
}) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchAvailable, setSearchAvailable] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setName(getDisplayName());
  }, []);

  const trimmed = query.trim();
  const urlVideoId = trimmed ? parseYouTubeId(trimmed) : null;

  // Debounced search-as-you-type. Skips the network call when the input
  // looks like a YouTube URL (the user is clearly pasting) or when search
  // has been reported unavailable (no API key configured on the server).
  useEffect(() => {
    if (!trimmed || urlVideoId || !searchAvailable) {
      abortRef.current?.abort();
      setResults([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: ctl.signal },
        );
        if (res.status === 503) {
          setSearchAvailable(false);
          return;
        }
        if (!res.ok) {
          setError("Search failed — try pasting a link instead.");
          setResults([]);
          return;
        }
        const data = (await res.json()) as { results?: SearchResult[] };
        setResults(data.results ?? []);
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") {
          setError("Search failed — try pasting a link instead.");
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [trimmed, urlVideoId, searchAvailable]);

  async function addVideo(
    videoId: string,
    meta?: { title?: string; thumbnail?: string },
  ) {
    setError(null);
    setAddingId(videoId);
    if (name.trim()) setDisplayName(name.trim());
    try {
      const res = await fetch(`/api/party/${code}/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          videoId,
          userId: getUserId(),
          addedBy: name.trim() || "Anonymous",
          title: meta?.title,
          thumbnail: meta?.thumbnail,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't add that one");
        return;
      }
      onAdded(data.party as PublicParty);
      setQuery("");
      setResults([]);
    } catch {
      setError("Network error — try again?");
    } finally {
      setAddingId(null);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (urlVideoId) {
      await addVideo(urlVideoId);
      return;
    }
    // If there's an active search with at least one non-banned result, Enter
    // adds the top unbanned result.
    const top = results.find((r) => !bannedIds?.has(r.videoId));
    if (top) {
      await addVideo(top.videoId, {
        title: top.title,
        thumbnail: top.thumbnail,
      });
      return;
    }
    setError(
      searchAvailable
        ? "Keep typing or paste a YouTube link."
        : "Paste a YouTube link.",
    );
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <div>
        <label className="mb-1 block text-sm text-white/70">Your name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="Anonymous"
          maxLength={40}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-white/70">
          {searchAvailable
            ? "Search YouTube or paste a link"
            : "Paste a YouTube link"}
        </label>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              searchAvailable
                ? "e.g. daft punk one more time"
                : "https://youtu.be/…"
            }
            className="input flex-1"
            autoComplete="off"
            spellCheck={false}
          />
          {urlVideoId ? (
            <button
              type="submit"
              className="btn-primary"
              disabled={!!addingId}
            >
              {addingId ? "Adding…" : "Add"}
            </button>
          ) : null}
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        ) : null}
      </div>

      {loading ? (
        <div className="text-sm text-white/50">Searching…</div>
      ) : null}

      {!urlVideoId && results.length > 0 ? (
        <ul className="space-y-2" role="listbox">
          {results.map((r) => {
            const banned = bannedIds?.has(r.videoId) ?? false;
            return (
              <li
                key={r.videoId}
                className={
                  "flex items-center gap-3 rounded-lg p-2 " +
                  (banned
                    ? "bg-red-950/40 opacity-60"
                    : "bg-white/5 hover:bg-white/10")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.thumbnail}
                  alt=""
                  className="h-12 w-20 flex-shrink-0 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-snug break-words">
                    {r.title}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-white/50">
                    {r.channelTitle}
                    {r.duration ? ` · ${r.duration}` : ""}
                  </div>
                </div>
                {banned ? (
                  <span
                    className="rounded-md bg-red-600/50 px-2 py-1 text-xs font-medium"
                    title="This video is banned from the party"
                  >
                    Banned
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost !px-3 !py-1 text-sm"
                    disabled={addingId === r.videoId}
                    onClick={() =>
                      addVideo(r.videoId, {
                        title: r.title,
                        thumbnail: r.thumbnail,
                      })
                    }
                  >
                    {addingId === r.videoId ? "…" : "Add"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </form>
  );
}
