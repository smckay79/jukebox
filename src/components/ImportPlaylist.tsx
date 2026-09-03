"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditPlaylistModal from "./EditPlaylistModal";
import PartyPlaylistEditor from "./PartyPlaylistEditor";
import PlaylistVideoSearchModal from "./PlaylistVideoSearchModal";
import { getAdminKey } from "@/lib/identity";
import { shuffleArray } from "@/lib/shuffle";
import type {
  PublicParty,
  PublicUser,
  SavedPlaylistSummary,
} from "@/lib/types";

interface PreviewItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
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

interface ManualSelection {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
}

const MATCH_CONCURRENCY = 6;

export default function ImportPlaylist({
  code,
  bannedIds,
  onImported,
  country,
  authUser,
  isAdmin,
  refreshKey,
}: {
  code: string;
  bannedIds: Set<string>;
  onImported: (party: PublicParty) => void;
  country?: string;
  authUser?: PublicUser | null;
  isAdmin?: boolean;
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [matches, setMatches] = useState<Map<string, MatchCandidate | null>>(
    new Map(),
  );
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });
  const [matchEnabled, setMatchEnabled] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState<Set<string>>(new Set());
  const [region, setRegion] = useState<string | null>(null);
  const [manualSelections, setManualSelections] = useState<
    Map<string, ManualSelection>
  >(new Map());
  const [searchingFor, setSearchingFor] = useState<PreviewItem | null>(null);

  const matchGen = useRef(0);

  // --- Saved (user-owned) playlists ---
  const [savedPlaylists, setSavedPlaylists] = useState<
    SavedPlaylistSummary[]
  >([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  );

  const loadSavedPlaylists = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await fetch("/api/playlists", { cache: "no-store" });
      if (!res.ok) {
        if (res.status !== 401) setSavedError("Couldn't load your playlists");
        setSavedPlaylists([]);
        return;
      }
      const data = (await res.json()) as { playlists?: SavedPlaylistSummary[] };
      setSavedPlaylists(data.playlists ?? []);
    } catch {
      setSavedError("Network error");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) loadSavedPlaylists();
    else setSavedPlaylists([]);
  }, [authUser, loadSavedPlaylists, refreshKey]);

  async function loadSavedIntoParty(id: string) {
    const key = getAdminKey(code);
    if (!key) {
      setSavedError("Only the host can load a playlist into the party.");
      return;
    }
    const shuffle = confirm(
      "Randomize the track order before setting this as the party playlist?\n\nOK = shuffle the order. Cancel = keep it as saved.",
    );
    setBusyPlaylistId(id);
    setSavedError(null);
    try {
      const res = await fetch(`/api/party/${code}/load-playlist`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({ playlistId: id, shuffle }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSavedError(
          (data as { error?: string }).error ?? "Couldn't load that playlist",
        );
        return;
      }
      onImported((data as { party: PublicParty }).party);
      const count = (data as { count?: number }).count ?? 0;
      setFlash(
        `Loaded ${count} track${count === 1 ? "" : "s"} from your playlist.`,
      );
    } catch {
      setSavedError("Network error");
    } finally {
      setBusyPlaylistId(null);
    }
  }

  async function deleteSavedPlaylist(id: string, name: string) {
    if (!confirm(`Delete playlist "${name}"? This can't be undone.`)) return;
    setBusyPlaylistId(id);
    setSavedError(null);
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSavedError(data.error ?? "Couldn't delete that playlist");
        return;
      }
      setSavedPlaylists((ps) => ps.filter((p) => p.id !== id));
    } catch {
      setSavedError("Network error");
    } finally {
      setBusyPlaylistId(null);
    }
  }

  async function saveSelectionAsPlaylist() {
    if (!items || selected.size === 0) return;
    const name = saveName.trim();
    if (!name) {
      setError("Give your playlist a name first.");
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const picks = items
      .filter((it) => selected.has(it.videoId))
      .map((it) => effectiveFor(it));
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, items: picks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't save");
        return;
      }
      setFlash(`Saved "${name}" to your playlists.`);
      setSaveName("");
      loadSavedPlaylists();
    } catch {
      setError("Network error — try again?");
    } finally {
      setSaving(false);
    }
  }

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
    matchGen.current += 1;
    try {
      const qs = new URLSearchParams({ id: v });
      if (country) qs.set("country", country);
      const res = await fetch(`/api/youtube/playlist?${qs.toString()}`, {
        cache: "no-store",
      });
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

  function handleVideoSelected(result: {
    videoId: string;
    title: string;
    channelTitle: string;
    thumbnail: string;
    duration?: string;
  }) {
    if (!searchingFor) return;
    setManualSelections((m) => {
      const n = new Map(m);
      n.set(searchingFor.videoId, {
        videoId: result.videoId,
        title: result.title,
        channelTitle: result.channelTitle,
        thumbnail: result.thumbnail,
        duration: result.duration,
      });
      return n;
    });
    setSearchingFor(null);
  }

  function effectiveFor(it: PreviewItem): {
    videoId: string;
    title: string;
    thumbnail: string;
  } {
    // Prefer manual selection over everything else
    const manual = manualSelections.get(it.videoId);
    if (manual) {
      return {
        videoId: manual.videoId,
        title: manual.title,
        thumbnail: manual.thumbnail,
      };
    }
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
    let picks = items
      .filter((it) => selected.has(it.videoId))
      .map((it) => effectiveFor(it));
    if (picks.length > 1) {
      const shuffle = confirm(
        `Randomize the order of these ${picks.length} tracks before adding them to the party playlist?\n\nOK = shuffle the order. Cancel = keep the playlist's original order.`,
      );
      if (shuffle) picks = shuffleArray(picks);
    }
    setSubmitting(true);
    setError(null);
    setFlash(null);
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
          {isAdmin ? (
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="btn-ghost w-full !py-2 text-sm"
              title="Reorder or remove tracks, and add previously played songs"
            >
              ✎ Edit current playlist / add from history
            </button>
          ) : null}
          {authUser ? (
            <div className="rounded-lg bg-white/5 p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
                <span>Your saved playlists</span>
                {savedLoading ? (
                  <span className="text-white/40">Loading…</span>
                ) : null}
              </div>
              {savedError ? (
                <p className="text-xs text-red-400">{savedError}</p>
              ) : null}
              {!savedLoading && savedPlaylists.length === 0 ? (
                <p className="text-xs text-white/50">
                  You haven&apos;t saved any playlists yet. Load a YouTube
                  playlist below, pick your favorites, and hit Save.
                </p>
              ) : null}
              {savedPlaylists.length > 0 ? (
                <ul className="space-y-1">
                  {savedPlaylists.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-white/50">
                          {p.count} track{p.count === 1 ? "" : "s"}
                        </div>
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={busyPlaylistId === p.id}
                          onClick={() => loadSavedIntoParty(p.id)}
                          className="rounded bg-brand-600/80 px-2 py-0.5 text-white hover:bg-brand-500"
                          title="Load this playlist as the party's background loop"
                        >
                          {busyPlaylistId === p.id ? "…" : "Load"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyPlaylistId === p.id}
                        onClick={() => setEditingPlaylistId(p.id)}
                        className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
                        title="Rename, reorder, or remove tracks"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyPlaylistId === p.id}
                        onClick={() => deleteSavedPlaylist(p.id, p.name)}
                        className="rounded bg-white/10 px-2 py-0.5 text-white/70 hover:bg-red-600/60 hover:text-white"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

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

              {authUser ? (
                <div className="rounded-lg bg-white/5 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Save to your account
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Playlist name"
                      maxLength={80}
                      className="input flex-1 !py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={saving || selected.size === 0 || !saveName.trim()}
                      onClick={saveSelectionAsPlaylist}
                      className="btn-ghost !px-3 !py-1 text-sm"
                      title="Save the selected tracks as a reusable playlist on your account"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : null}

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
                        <div className="mt-1 flex flex-wrap gap-2">
                          {match && matchEnabled ? (
                            <button
                              type="button"
                              onClick={() => toggleUseOriginal(r.videoId)}
                              className="text-[11px] text-brand-300 underline-offset-2 hover:underline"
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
                          <button
                            type="button"
                            onClick={() => setSearchingFor(r)}
                            className="text-[11px] text-white/40 hover:text-white/60"
                            title="Search for a different video"
                          >
                            {manualSelections.has(r.videoId)
                              ? "✓ Custom video"
                              : "🔍 Search"}
                          </button>
                        </div>
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

      {editingPlaylistId ? (
        <EditPlaylistModal
          playlistId={editingPlaylistId}
          onClose={() => setEditingPlaylistId(null)}
          onSaved={(updated) => {
            setSavedPlaylists((ps) =>
              ps.map((p) =>
                p.id === updated.id
                  ? {
                      ...p,
                      name: updated.name,
                      count: updated.count,
                      updatedAt: Date.now(),
                    }
                  : p,
              ),
            );
          }}
        />
      ) : null}

      {searchingFor ? (
        <PlaylistVideoSearchModal
          songTitle={searchingFor.title}
          onSelect={handleVideoSelected}
          onClose={() => setSearchingFor(null)}
          country={country}
        />
      ) : null}

      {showEditor && getAdminKey(code) ? (
        <PartyPlaylistEditor
          code={code}
          adminKey={getAdminKey(code) as string}
          country={country}
          onClose={() => setShowEditor(false)}
          onSaved={(party) => {
            onImported(party);
            setFlash("Party playlist updated.");
          }}
        />
      ) : null}
    </div>
  );
}
