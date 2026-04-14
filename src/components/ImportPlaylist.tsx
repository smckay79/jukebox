"use client";

import { useMemo, useState } from "react";
import { getDisplayName, getUserId } from "@/lib/identity";
import type { PublicParty } from "@/lib/types";

interface PreviewItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
}

// Collapsible card that lets a guest paste a YouTube / YouTube Music
// playlist URL (or just its ID), preview the tracks, pick which ones to
// keep, and bulk-add them in one Redis round-trip. Handy for importing
// the user's "Liked music" playlist — they just need to set it at least
// to unlisted so the server can read it with the public API key.
export default function ImportPlaylist({
  code,
  bannedIds,
  queuedIds,
  onImported,
}: {
  code: string;
  bannedIds: Set<string>;
  queuedIds: Set<string>;
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

  async function loadPlaylist(e: React.FormEvent) {
    e.preventDefault();
    const v = raw.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setFlash(null);
    setItems(null);
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
      setItems(results);
      // Default: everything selectable (not banned, not already in queue).
      const next = new Set<string>();
      for (const r of results) {
        if (!bannedIds.has(r.videoId) && !queuedIds.has(r.videoId)) {
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
      if (!bannedIds.has(r.videoId) && !queuedIds.has(r.videoId)) {
        next.add(r.videoId);
      }
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function submit() {
    if (!items || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    setFlash(null);
    const picks = items.filter((it) => selected.has(it.videoId));
    try {
      const res = await fetch(`/api/party/${code}/bulk-add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: getUserId(),
          addedBy: getDisplayName() || "Anonymous",
          items: picks.map((p) => ({
            videoId: p.videoId,
            title: p.title,
            thumbnail: p.thumbnail,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't import");
        return;
      }
      onImported((data as { party: PublicParty }).party);
      const added = (data as { added?: number }).added ?? 0;
      const dup = (data as { skippedDuplicate?: number }).skippedDuplicate ?? 0;
      const ban = (data as { skippedBanned?: number }).skippedBanned ?? 0;
      const parts = [`Added ${added}`];
      if (dup) parts.push(`${dup} already queued`);
      if (ban) parts.push(`${ban} banned`);
      setFlash(parts.join(" · "));
      setItems(null);
      setSelected(new Set());
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
      (it) => !bannedIds.has(it.videoId) && !queuedIds.has(it.videoId),
    ).length;
  }, [items, bannedIds, queuedIds]);

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Import a playlist{" "}
          <span className="font-normal text-white/50">
            · YouTube Music favorites
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
              <div className="flex items-center justify-between text-xs text-white/60">
                <span>
                  {selected.size} of {items.length} selected
                  {eligibleCount < items.length ? (
                    <span className="text-white/40">
                      {" "}
                      · {items.length - eligibleCount} unavailable
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
              <ul className="max-h-[50vh] space-y-2 overflow-auto">
                {items.map((r) => {
                  const banned = bannedIds.has(r.videoId);
                  const queued = queuedIds.has(r.videoId);
                  const disabled = banned || queued;
                  const checked = selected.has(r.videoId);
                  const badge = banned
                    ? "Banned"
                    : queued
                      ? "Already queued"
                      : null;
                  return (
                    <li
                      key={r.videoId}
                      className={
                        "flex items-center gap-2 rounded-md p-2 " +
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
                        className="h-4 w-4 flex-shrink-0 accent-brand-500"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={r.thumbnail}
                        alt=""
                        className="h-8 w-14 flex-shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs leading-snug break-words">
                          {r.title}
                        </div>
                        <div className="truncate text-[11px] text-white/50">
                          {r.channelTitle}
                          {r.duration ? ` · ${r.duration}` : ""}
                        </div>
                      </div>
                      {badge ? (
                        <span className="flex-shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">
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
                    ? "Adding…"
                    : `Add ${selected.size} song${selected.size === 1 ? "" : "s"} to queue`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
