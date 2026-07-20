"use client";

import { useEffect, useRef, useState } from "react";

interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
}

export default function PlaylistVideoSearchModal({
  songTitle: initialTitle,
  onSelect,
  onClose,
  country,
}: {
  songTitle: string;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
  country?: string;
}) {
  const [query, setQuery] = useState(initialTitle);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  const performSearch = async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ q });
      if (country) qs.set("country", country);
      const res = await fetch(`/api/search?${qs.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Search failed");
        setResults([]);
        return;
      }
      const data = (await res.json()) as { results?: SearchResult[] };
      setResults(data.results ?? []);
    } catch {
      setError("Network error");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    // Debounce search
    clearTimeout(searchTimeoutRef.current);
    if (query.trim()) {
      setSearching(true);
      searchTimeoutRef.current = setTimeout(() => {
        void performSearch(query);
      }, 300);
    } else {
      setResults([]);
    }
    return () => clearTimeout(searchTimeoutRef.current);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg bg-gray-900 shadow-xl">
        {/* Header */}
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Find a video</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-white/50 hover:text-white/80"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a song, artist, or video..."
            autoFocus
            className="input w-full text-sm"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto">
          {error ? (
            <div className="p-4 text-center text-red-400 text-sm">{error}</div>
          ) : searching ? (
            <div className="p-4 text-center text-white/50 text-sm">
              Searching…
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="p-4 text-center text-white/50 text-sm">
              No results found
            </div>
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-white/50 text-sm">
              Type to search
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {results.map((result) => (
                <li key={result.videoId}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(result);
                      onClose();
                    }}
                    className="w-full text-left flex gap-2 rounded-lg bg-white/5 p-2 hover:bg-white/10 transition"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={result.thumbnail}
                      alt=""
                      className="h-12 w-20 flex-shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white truncate">
                        {result.title}
                      </div>
                      <div className="text-xs text-white/60 truncate">
                        {result.channelTitle}
                        {result.duration ? ` · ${result.duration}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
