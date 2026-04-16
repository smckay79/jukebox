"use client";

import type { Song } from "@/lib/types";

// Compact now-playing card for mobile. No iframe — avoids burning mobile
// data for guests who are only here to queue songs. Playback happens on
// the desktop/TV tab.
export default function NowPlayingCompact({
  song,
  isAdmin,
  onSkip,
  onBan,
}: {
  song: Song | null;
  isAdmin: boolean;
  onSkip: () => void;
  onBan: (song: Song) => void;
}) {
  if (!song) {
    return (
      <div className="card flex items-center gap-3 p-3 text-white/50">
        <div className="grid h-12 w-20 flex-shrink-0 place-items-center rounded bg-black/40 text-xs">
          ♪
        </div>
        <div className="min-w-0 flex-1 text-sm">
          Nothing playing yet — add a banger below!
        </div>
      </div>
    );
  }
  return (
    <div className="card flex items-center gap-3 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={song.thumbnail}
        alt=""
        className="h-12 w-20 flex-shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-400">
          Now playing
        </div>
        <div className="truncate font-medium">{song.title}</div>
        <div className="truncate text-xs text-white/50">
          Added by {song.addedBy}
        </div>
      </div>
      {isAdmin ? (
        <div className="flex flex-shrink-0 flex-col gap-1">
          <button
            onClick={onSkip}
            className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium hover:bg-brand-500"
            title="Skip"
          >
            Skip
          </button>
          <button
            onClick={() => onBan(song)}
            className="rounded-md bg-red-600/80 px-2 py-1 text-xs font-medium hover:bg-red-500"
            title="Ban this song from the party"
          >
            Ban
          </button>
        </div>
      ) : null}
    </div>
  );
}
