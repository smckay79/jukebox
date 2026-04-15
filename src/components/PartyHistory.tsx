"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicUser, Song } from "@/lib/types";

// Admin-only history panel. Lists the songs that have actually played
// through the jukebox (newest first) and lets a signed-in host save a
// selection as a reusable saved-playlist — so last night's best run can
// come back tomorrow as the party's background loop.
export default function PartyHistory({
  code,
  adminKey,
  authUser,
  // Poll / re-fetch trigger. When the parent's party state flips (a song
  // ended, a skip happened) we bump this to nudge a refresh even when
  // the panel is open.
  nowPlayingVideoId,
  onSaved,
}: {
  code: string;
  adminKey: string;
  authUser: PublicUser | null;
  nowPlayingVideoId?: string | null;
  // Called after a successful save so the parent (ImportPlaylist) can
  // refresh its list of saved playlists without the user re-opening the
  // card. Optional — we also show an inline confirmation either way.
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<Song[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Selection is keyed by the Song.id (unique per history entry) so the
  // same videoId played twice can be individually (un)picked.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/party/${code}/history`, {
        cache: "no-store",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized" : "Couldn't load history");
        setHistory([]);
        return;
      }
      const data = (await res.json()) as { history: Song[] };
      setHistory(data.history ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [code, adminKey]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // When something new starts playing while the panel is open, refresh
  // so the host sees the previous track drop into history immediately.
  useEffect(() => {
    if (open && nowPlayingVideoId !== undefined) load();
    // nowPlayingVideoId is the trigger; load is stable w/ useCallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nowPlayingVideoId]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAll() {
    if (!history) return;
    // Dedupe by videoId so "select all" doesn't set us up to save the
    // same track twice — the server dedupes anyway, but this keeps the
    // UI count honest.
    const seen = new Set<string>();
    const next = new Set<string>();
    for (const s of history) {
      if (seen.has(s.videoId)) continue;
      seen.add(s.videoId);
      next.add(s.id);
    }
    setSelected(next);
  }

  function clear() {
    setSelected(new Set());
  }

  const uniqueVideoIds = useMemo(() => {
    if (!history) return 0;
    return new Set(history.map((s) => s.videoId)).size;
  }, [history]);

  async function saveSelection() {
    if (!history || selected.size === 0) return;
    const name = saveName.trim();
    if (!name) {
      setError("Give your playlist a name first.");
      return;
    }
    // Dedupe by videoId here too; preserve the order of first selection
    // as it appears in the history (newest first).
    const seen = new Set<string>();
    const items: { videoId: string; title: string; thumbnail: string }[] = [];
    for (const s of history) {
      if (!selected.has(s.id)) continue;
      if (seen.has(s.videoId)) continue;
      seen.add(s.videoId);
      items.push({
        videoId: s.videoId,
        title: s.title,
        thumbnail: s.thumbnail,
      });
    }
    if (items.length === 0) return;
    setSaving(true);
    setError(null);
    setFlash(null);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, items }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't save");
        return;
      }
      setFlash(
        `Saved "${name}" with ${items.length} track${items.length === 1 ? "" : "s"}.`,
      );
      setSaveName("");
      setSelected(new Set());
      onSaved?.();
    } catch {
      setError("Network error — try again?");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Play history{" "}
          {history ? (
            <span className="font-normal text-white/50">
              · {history.length} played · {uniqueVideoIds} unique
            </span>
          ) : null}
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 text-xs">
          {error ? <p className="text-red-400">{error}</p> : null}
          {flash ? <p className="text-emerald-300">{flash}</p> : null}

          {loading && !history ? (
            <p className="text-white/50">Loading…</p>
          ) : null}

          {history && history.length === 0 ? (
            <p className="text-white/50">
              Nothing has played yet. Once songs finish (or you skip them),
              they&apos;ll show up here.
            </p>
          ) : null}

          {history && history.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-white/60">
                <span>{selected.size} selected</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-white/70 hover:text-white"
                  >
                    Select all unique
                  </button>
                  <span className="text-white/30">·</span>
                  <button
                    type="button"
                    onClick={clear}
                    className="text-white/70 hover:text-white"
                  >
                    None
                  </button>
                  <span className="text-white/30">·</span>
                  <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="text-white/70 hover:text-white"
                    title="Reload history"
                  >
                    {loading ? "…" : "Refresh"}
                  </button>
                </div>
              </div>

              {authUser ? (
                <div className="rounded-lg bg-white/5 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Save history to your account
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Playlist name (e.g. Saturday night set)"
                      maxLength={80}
                      className="input flex-1 !py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={saving || selected.size === 0 || !saveName.trim()}
                      onClick={saveSelection}
                      className="btn-primary !px-3 !py-1 text-sm"
                      title="Save the selected played tracks as a reusable playlist"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-white/50">
                  Sign in to save this history as a reusable playlist.
                </p>
              )}

              <ul className="max-h-[50vh] space-y-1 overflow-auto">
                {history.map((s) => {
                  const checked = selected.has(s.id);
                  return (
                    <li
                      key={s.id}
                      className="flex items-start gap-2 rounded bg-white/5 p-1.5 hover:bg-white/10"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(s.id)}
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
                          {s.addedBy} · {formatAgo(s.addedAt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatAgo(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
