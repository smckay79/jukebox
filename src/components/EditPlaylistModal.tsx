"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlaylistTrack, SavedPlaylist } from "@/lib/types";

// Modal for editing a saved playlist: rename, reorder (up/down buttons
// per row — sufficient for the typical party-sized list, avoids pulling
// in a drag-and-drop dep), and remove tracks. Saves via PUT which fully
// replaces the item list server-side.
export default function EditPlaylistModal({
  playlistId,
  onClose,
  onSaved,
}: {
  playlistId: string;
  onClose: () => void;
  // Called with the updated playlist so the parent can refresh its list.
  onSaved: (updated: { id: string; name: string; count: number }) => void;
}) {
  const [playlist, setPlaylist] = useState<SavedPlaylist | null>(null);
  const [name, setName] = useState("");
  const [items, setItems] = useState<PlaylistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Couldn't load playlist");
        return;
      }
      const data = (await res.json()) as { playlist: SavedPlaylist };
      setPlaylist(data.playlist);
      setName(data.playlist.name);
      setItems(data.playlist.items);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    load();
  }, [load]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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

  function onRename(v: string) {
    setName(v);
    setDirty(true);
  }

  async function save() {
    if (!playlist) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setError("Give your playlist a name.");
      return;
    }
    if (items.length === 0) {
      setError("A playlist needs at least one track.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/playlists/${playlistId}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: cleanName, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't save");
        return;
      }
      const updated = (data as { playlist: SavedPlaylist }).playlist;
      onSaved({
        id: updated.id,
        name: updated.name,
        count: updated.items.length,
      });
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
          <h2 className="text-sm font-semibold">Edit playlist</h2>
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
          ) : error && !playlist ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : playlist ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => onRename(e.target.value)}
                  maxLength={80}
                  className="input w-full !py-1 text-sm"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  <span>
                    Tracks ·{" "}
                    <span className="font-normal normal-case text-white/60">
                      {items.length}
                    </span>
                  </span>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-white/50">
                    No tracks left — add one back by reloading, or delete the
                    playlist.
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

              {error ? <p className="text-xs text-red-400">{error}</p> : null}
            </div>
          ) : null}
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
            disabled={saving || loading || !playlist || items.length === 0}
            className="btn-primary !px-3 !py-1.5 text-sm"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
