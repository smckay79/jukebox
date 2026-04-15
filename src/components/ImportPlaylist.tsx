"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicParty } from "@/lib/types";

interface PreviewItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  // Filled in by the server from videos.list regionRestriction; when false
  // we flag the row and exclude it from the default selection.
  available?: boolean;
  unavailableReason?: string;
}

interface MatchCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  score: number;
}

// Matching runs this many lookups in parallel. Innertube is free of quota
// but round-trips take ~500ms-1s, so the batch size mostly trades latency
// for politeness. 6 keeps a 100-song playlist matched in ~15s.
const MATCH_CONCURRENCY = 6;

// Collapsible card that lets the host paste a YouTube / YouTube Music
// playlist URL (or ID), preview the tracks, pick which ones to keep, and
// set them as the party's background playlist. The tracks loop whenever
// the user queue is empty; any user-added song interrupts and ranks
// higher. After the preview loads, a background worker tries to automatch
// each item against its official music video (for YouTube Music "- Topic"
// auto-audio entries) via the /api/youtube/match endpoint.
export default function ImportPlaylist({
  code,
  bannedIds,
  onImported,
}: {
  code: string;
  bannedIds: Set<string>;
  onImported: (party: PublicParty) => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // videoId of the original preview item -> the matched music-video
  // candidate we found (or null once we've tried and given up).
  const [matches, setMatches] = useState<Map<string, MatchCandidate | null>>(
    new Map(),
  );
  // How many items we've attempted to match. Combined with items.length this
  // drives the "Matching music videos… 42/99" progress line.
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });
  const [matchEnabled, setMatchEnabled] = useState(true);
  // videoId of originals the user explicitly wants to keep as-is (even
  // though a match was found). Default behavior: use the match if present.
  const [keepOriginal, setKeepOriginal] = useState<Set<string>>(new Set());
  // Two-letter country code the server used to evaluate regionRestriction.
  // Shown inline on the "N unavailable in your region" line so the host
  // knows which country we checked against.
  const [region, setRegion] = useState<string | null>(null);

  // A ref + generation counter so we can cancel a match pass when the user
  // loads a different playlist mid-flight.
  const matchGen = useRef(0);

  async function loadPlaylist(e: React.FormEvent) {
    e.preventDefault();
    const v = raw.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setFlash(null);
    setItems(null);
    setMatches(new Map());
    setMatchProgress({ done: 0, total: 0 });
    setKeepOriginal(new Set());
    // Bump generation so any in-flight match worker from a previous load
    // sees the change and bails out.
    matchGen.current += 1;
    try {
      const res = await fetch(
        `/api/youtube/playlist?id=${encodeURIComponent(v)}`,
        { cache: "no-store" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          (data as { error?: string }).error ?? "Couldn't load that playlist",
        );
        return;
      }
      const results = (data as { results?: PreviewItem[] }).results ?? [];
      const reg = (data as { region?: string }).region ?? null;
      setItems(results);
      setRegion(reg);
      const next = new Set<string>();
      for (const r of results) {
        if (!bannedIds.has(r.videoId) && r.available !== false) {
          next.add(r.videoId);
        }
      }
      setSelected(next);
    } catch {
      setError("Network error — try again?");
    } finally {
      setLoading(false);
    }
  }

  // Kick off the match worker whenever items load. Cancellation uses the
  // generation counter so a superseded pass can silently bow out.
  const startMatching = useCallback(
    (list: PreviewItem[]) => {
      const gen = ++matchGen.current;
      setMatchProgress({ done: 0, total: list.length });
      let idx = 0;
      let done = 0;

      async function worker() {
        while (true) {
          if (gen !== matchGen.current) return;
          const i = idx++;
          if (i >= list.length) return;
          const it = list[i];
          let match: MatchCandidate | null = null;
          try {
            const qs = new URLSearchParams({
              videoId: it.videoId,
              title: it.title,
              channel: it.channelTitle,
            });
            if (it.durationSeconds) {
              qs.set("duration", String(it.durationSeconds));
            }
            const res = await fetch(`/api/youtube/match?${qs.toString()}`, {
              cache: "no-store",
            });
            if (res.ok) {
              const data = (await res.json()) as {
                match?: MatchCandidate | null;
              };
              match = data.match ?? null;
            }
          } catch {
            match = null;
          }
          if (gen !== matchGen.current) return;
          setMatches((prev) => {
            const n = new Map(prev);
            n.set(it.videoId, match);
            return n;
          });
          done += 1;
          setMatchProgress({ done, total: list.length });
        }
      }

      const workers = Array.from(
        { length: Math.min(MATCH_CONCURRENCY, list.length) },
        () => worker(),
      );
      void Promise.all(workers);
    },
    [],
  );

  useEffect(() => {
    if (items && items.length > 0) startMatching(items);
  }, [items, startMatching]);

  function toggle(videoId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(videoId)) n.delete(videoId);
      else n.add(videoId);
      return n;
    });
  }

  function selectAllEligible() {
    if (!items) return;
    const next = new Set<string>();
    for (const r of items) {
      if (!bannedIds.has(r.videoId) && r.available !== false) {
        next.add(r.videoId);
      }
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleUseOriginal(videoId: string) {
    setKeepOriginal((s) => {
      const n = new Set(s);
      if (n.has(videoId)) n.delete(videoId);
      else n.add(videoId);
      return n;
    });
  }

  // What we'll actually send for a given preview row: the match if we have
  // one and the user hasn't overridden, otherwise the original.
  function effectiveFor(it: PreviewItem): {
    videoId: string;
    title: string;
    thumbnail: string;
  } {
    const m = matches.get(it.videoId);
    if (m && matchEnabled && !keepOriginal.has(it.videoId)) {
      return { videoId: m.videoId, title: m.title, thumbnail: m.thumbnail };
    }
    return {
      videoId: it.videoId,
      title: it.title,
      thumbnail: it.thumbnail,
    };
  }

  async function submit() {
    if (!items || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    setFlash(null);
    const picks = items
      .filter((it) => selected.has(it.videoId))
      .map((it) => effectiveFor(it));
    try {
      const res = await fetch(`/api/party/${code}/bulk-add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: picks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't import");
        return;
      }
      onImported((data as { party: PublicParty }).party);
      const count = (data as { count?: number }).count ?? picks.length;
      setFlash(
        `Party playlist set · ${count} track${count === 1 ? "" : "s"} will loop in the background.`,
      );
      setItems(null);
      setSelected(new Set());
      setMatches(new Map());
      setKeepOriginal(new Set());
      setMatchProgress({ done: 0, total: 0 });
      matchGen.current += 1;
      setRaw("");
    } catch {
      setError("Network error — try again?");
    } finally {
      setSubmitting(false);
    }
  }

  const eligibleCount = useMemo(() => {
    if (!items) return 0;
    return items.filter(
      (it) => !bannedIds.has(it.videoId) && it.available !== false,
    ).length;
  }, [items, bannedIds]);

  const unavailableCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((it) => it.available === false).length;
  }, [items]);

  const matchCount = useMemo(() => {
    let n = 0;
    for (const v of matches.values()) if (v) n++;
    return n;
  }, [matches]);

  const matching =
    matchProgress.total > 0 && matchProgress.done < matchProgress.total;

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Party playlist{" "}
          <span className="font-normal text-white/50">
            · loops when the queue is empty
          </span>
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <form onSubmit={loadPlaylist} className="flex gap-2">
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Playlist URL or ID"
              className="input flex-1 !py-1.5 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={loading || !raw.trim()}
              className="btn-primary !px-3 !py-1.5 text-sm"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </form>
          <p className="text-xs text-white/50">
            Paste a YouTube or YouTube Music playlist link. For your &ldquo;Liked
            music&rdquo; playlist, set it to Unlisted or Public first so the
            server can read it.
          </p>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          {flash ? <p className="text-xs text-emerald-300">{flash}</p> : null}

          {items && items.length === 0 ? (
            <p className="text-xs text-white/50">
              No playable videos in that playlist.
            </p>
          ) : null}

          {items && items.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                <span>
                  {selected.size} of {items.length} selected
                  {unavailableCount > 0 ? (
                    <span className="text-amber-300/80">
                      {" "}
                      · {unavailableCount} not available
                      {region ? ` in ${region}` : ""}
                    </span>
                  ) : null}
                  {eligibleCount < items.length - unavailableCount ? (
                    <span className="text-white/40">
                      {" "}
                      ·{" "}
                      {items.length - eligibleCount - unavailableCount} banned
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllEligible}
                    className="text-white/70 hover:text-white"
                  >
                    Select all
                  </button>
                  <span className="text-white/30">·</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-white/70 hover:text-white"
                  >
                    None
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-white/70">
                <input
                  type="checkbox"
                  checked={matchEnabled}
                  onChange={(e) => setMatchEnabled(e.target.checked)}
                  className="h-3.5 w-3.5 accent-brand-500"
                />
                <span>
                  Upgrade to music videos when found
                  {matching ? (
                    <span className="text-white/40">
                      {" "}
                      · matching {matchProgress.done}/{matchProgress.total}…
                    </span>
                  ) : matchProgress.total > 0 ? (
                    <span className="text-white/40">
                      {" "}
                      · found {matchCount} music video{matchCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </span>
              </label>

              <ul className="max-h-[50vh] space-y-2 overflow-auto">
                {items.map((r) => {
                  const banned = bannedIds.has(r.videoId);
                  const unavailable = r.available === false;
                  const disabled = banned || unavailable;
                  const checked = selected.has(r.videoId);
                  const match = matches.get(r.videoId) ?? null;
                  const usingMatch =
                    !!match && matchEnabled && !keepOriginal.has(r.videoId);
                  const shown = usingMatch && match ? match : r;
                  const badge = banned
                    ? "Banned"
                    : unavailable
                      ? (r.unavailableReason ?? "Unavailable")
                      : null;
                  return (
                    <li
                      key={r.videoId}
                      className={
                        "flex items-start gap-2 rounded-md p-2 " +
                        (disabled
                          ? "bg-white/[0.03] opacity-60"
                          : "bg-white/5 hover:bg-white/10")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(r.videoId)}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-500"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shown.thumbnail}
                        alt=""
                        className="h-8 w-14 flex-shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs leading-snug break-words">
                          {shown.title}
                        </div>
                        <div className="truncate text-[11px] text-white/50">
                          {shown.channelTitle}
                          {shown.duration ? ` · ${shown.duration}` : ""}
                        </div>
                        {match && matchEnabled ? (
                          <button
                            type="button"
                            onClick={() => toggleUseOriginal(r.videoId)}
                            className="mt-1 text-[11px] text-brand-300 underline-offset-2 hover:underline"
                            title={
                              usingMatch
                                ? `Original: ${r.title}`
                                : `Music video: ${match.title}`
                            }
                          >
                            {usingMatch
                              ? "🎬 Music video · use original"
                              : "↺ Using original · use music video"}
                          </button>
                        ) : null}
                      </div>
                      {badge ? (
                        <span
                          className={
                            "flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] " +
                            (unavailable
                              ? "bg-amber-500/20 text-amber-200"
                              : "bg-white/10 text-white/70")
                          }
                          title={
                            unavailable
                              ? `This video isn't playable in ${region ?? "your region"}.`
                              : undefined
                          }
                        >
                          {unavailable ? "🌐 " : ""}
                          {badge}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={submitting || selected.size === 0}
                  onClick={submit}
                  className="btn-primary !px-3 !py-1.5 text-sm"
                >
                  {submitting
                    ? "Saving…"
                    : `Set as party playlist · ${selected.size} track${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
