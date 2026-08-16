"use client";

import { useState } from "react";
import type { BannedVideo } from "@/lib/types";

// Admin-only collapsible list of banned videos. Also lets the host add a
// fresh ban by pasting a YouTube URL or ID — useful before a song is ever
// queued, e.g. pre-emptive Baby Shark protection.
export default function BannedList({
  banned,
  onUnban,
  onBanUrl,
  onClearAutoBans,
}: {
  banned: BannedVideo[];
  onUnban: (videoId: string) => void;
  onBanUrl: (raw: string) => Promise<string | null>;
  onClearAutoBans?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const autoBanCount = banned.filter((b) =>
    b.title?.startsWith("[Auto-banned:"),
  ).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = raw.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    const errMsg = await onBanUrl(v);
    setBusy(false);
    if (errMsg) {
      setErr(errMsg);
    } else {
      setRaw("");
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
          Banned{" "}
          <span className="text-white/50">· {banned.length}</span>
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <form onSubmit={submit} className="flex gap-2">
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Ban a YouTube URL or ID"
              className="input flex-1 !py-1.5 text-sm"
            />
            <button
              type="submit"
              disabled={busy || !raw.trim()}
              className="rounded-md bg-red-600/80 px-3 py-1.5 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
            >
              {busy ? "…" : "Ban"}
            </button>
          </form>
          {err ? <p className="text-xs text-red-400">{err}</p> : null}
          {onClearAutoBans && autoBanCount > 0 ? (
            <button
              type="button"
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  await onClearAutoBans();
                } finally {
                  setClearing(false);
                }
              }}
              className="btn-ghost w-full !py-1.5 text-xs text-amber-300 hover:bg-amber-600/20"
              title="Remove videos that were auto-banned due to playback errors"
            >
              {clearing
                ? "Clearing…"
                : `Clear ${autoBanCount} auto-banned video${autoBanCount === 1 ? "" : "s"}`}
            </button>
          ) : null}
          {banned.length === 0 ? (
            <p className="text-xs text-white/50">Nothing banned yet.</p>
          ) : (
            <ul className="space-y-2">
              {banned.map((b) => (
                <li
                  key={b.videoId}
                  className="flex items-center gap-2 rounded-md bg-white/5 p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.thumbnail}
                    alt=""
                    className="h-8 w-14 flex-shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1 truncate text-xs">
                    {b.title}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnban(b.videoId)}
                    className="btn-ghost !px-2 !py-1 text-xs"
                    title="Unban"
                  >
                    Unban
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
