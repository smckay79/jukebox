"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlaylistTrack, PublicParty, Song } from "@/lib/types";

// Admin modal for editing the party's background playlist: reorder / remove
// tracks and add tracks pulled straight from the party's play history
// (previously played requests). Saving replaces the background playlist via
// PUT /api/party/[code]/playlist.
export default function PartyPlaylistEditor({
  code,
  adminKey,
  onClose,
  onSaved,
}: {
  code: string;
  adminKey: string;
  onClose: () => void;
  onSaved: (party: PublicParty) => void;
}) {
  const [items, setItems] = useState<PlaylistTrack[]>([]);
  const [history, setHistory] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plRes, hiRes] = await Promise.all([
        fetch(`/api/party/${code}/playlist`, {
          cache: "no-store",
          headers: { "x-admin-key": adminKey },
        }),
        fetch(`/api/party/${code}/history`, {
          cache: "no-store",
          headers: { "x-admin-key": adminKey },
        }),
      ]);
      if (!plRes.ok) {
        setError(plRes.status === 403 ? "Not authorized" : "Couldn't load playlist");
        return;
      }
      const plData = (await plRes.json()) as { items: PlaylistTrack[] };
      setItems(plData.items ?? []);
      if (hiRes.ok) {
        const hiData = (await hiRes.json()) as { history: Song[] };
        setHistory(hiData.history ?? []);
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [code, adminKey]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") attemptClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  const inPlaylist = useMemo(
    () => new Set(items.map((it) => it.videoId)),
    [items],
  );

  // History entries whose video isn't already in the playlist, deduped by
  // videoId (newest occurrence wins since history is newest-first).
  const addableHistory = useMemo(() => {
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const s of history) {
      if (inPlaylist.has(s.videoId)) continue;
      if (seen.has(s.videoId)) continue;
      seen.add(s.videoId);
      out.push(s);
    }
    return out;
  }, [history, inPlaylist]);

  function moveUp(i: number) {
    if (i <= 0) return;
    setItems((arr) => {
      const next = arr.slice();
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
    setDirty(true);
  }

  function moveDown(i: number) {
    setItems((arr) => {
      if (i >= arr.length - 1) return arr;
      const next = arr.slice();
      [next[i + 1], next[i]] = [next[i], next[i + 1]];
      return next;
    });
    setDirty(true);
  }

  function remove(i: number) {
    setItems((arr) => arr.filter((_, idx) => idx !== i));
    setDirty(true);
  }

  function togglePick(videoId: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(videoId)) n.delete(videoId);
      else n.add(videoId);
      return n;
    });
  }

  function addPicked() {
    if (picked.size === 0) return;
    const toAdd: PlaylistTrack[] = [];
    for (const s of addableHistory) {
      if (!picked.has(s.videoId)) continue;
      toAdd.push({
        videoId: s.videoId,
        title: s.title,
        thumbnail: s.thumbnail,
      });
    }
    if (toAdd.length === 0) return;
    setItems((arr) => [...arr, ...toAdd]);
    setPicked(new Set());
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/party/${code}/playlist`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ items }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        party?: PublicParty;
      };
      if (!res.ok) {
        setError(data.error ?? "Couldn't save");
        return;
      }
      if (data.party) onSaved(data.party);
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function attemptClose() {
    if (dirty && !confirm("Discard your edits?")) return;
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={attemptClose}
    >
      <div
        className="card relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold">Edit party playlist</h2>
          <button
            type="button"
            onClick={attemptClose}
            className="text-white/60 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          {loading ? (
            <p className="text-sm text-white/60">Loading…</p>
          ) : (
            <div className="space-y-4">
              {/* Current playlist */}
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Playlist ·{" "}
                  <span className="font-normal normal-case text-white/60">
                    {items.length} track{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-white/50">
                    No tracks yet. Add some from your play history below.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {items.map((it, i) => (
                      <li
                        key={`${it.videoId}-${i}`}
                        className="flex items-center gap-2 rounded bg-white/5 p-1.5 text-xs hover:bg-white/10"
                      >
                        <span className="w-5 flex-shrink-0 text-right font-mono text-white/40">
                          {i + 1}
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={it.thumbnail}
                          alt=""
                          className="h-8 w-14 flex-shrink-0 rounded object-cover"
                        />
                        <div className="min-w-0 flex-1 break-words text-white/90">
                          {it.title}
                        </div>
                        <div className="flex flex-shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => moveUp(i)}
                            disabled={i === 0}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-white/70 hover:bg-white/20 disabled:opacity-30"
                            aria-label="Move up"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveDown(i)}
                            disabled={i === items.length - 1}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-white/70 hover:bg-white/20 disabled:opacity-30"
                            aria-label="Move down"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(i)}
                            className="rounded bg-white/10 px-1.5 py-0.5 text-white/70 hover:bg-red-600/60 hover:text-white"
                            aria-label="Remove"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Add from play history */}
              <div className="border-t border-white/10 pt-3">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Add from play history
                  </span>
                  <button
                    type="button"
                    onClick={addPicked}
                    disabled={picked.size === 0}
                    className="btn-primary !px-2 !py-1 text-xs disabled:opacity-40"
                  >
                    Add {picked.size > 0 ? `${picked.size} ` : ""}selected
                  </button>
                </div>
                {addableHistory.length === 0 ? (
                  <p className="text-xs text-white/50">
                    No previously played tracks to add. Once songs play (and
                    aren&apos;t already in the playlist) they&apos;ll appear here.
                  </p>
                ) : (
                  <ul className="max-h-[35vh] space-y-1 overflow-auto">
                    {addableHistory.map((s) => {
                      const checked = picked.has(s.videoId);
                      return (
                        <li
                          key={s.id}
                          className="flex items-start gap-2 rounded bg-white/5 p-1.5 text-xs hover:bg-white/10"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePick(s.videoId)}
                            className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-500"
                          />
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={s.thumbnail}
                            alt=""
                            className="h-8 w-14 flex-shrink-0 rounded object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-white/90">
                              {s.title}
                            </div>
                            <div className="truncate text-white/50">
                              {s.addedBy}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {error ? <p className="text-xs text-red-400">{error}</p> : null}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            onClick={attemptClose}
            className="btn-ghost !px-3 !py-1.5 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || loading}
            className="btn-primary !px-3 !py-1.5 text-sm"
          >
            {saving ? "Saving…" : "Save playlist"}
          </button>
        </div>
      </div>
    </div>
  );
}
