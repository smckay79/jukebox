"use client";

import type { PublicParty, Song } from "@/lib/types";

export default function Queue({
  party,
  userId,
  isAdmin,
  onVote,
  onRemove,
  onBan,
}: {
  party: PublicParty;
  userId: string;
  isAdmin: boolean;
  onVote: (song: Song) => void;
  onRemove?: (song: Song) => void;
  onBan?: (song: Song) => void;
}) {
  if (party.queue.length === 0) {
    return (
      <div className="card p-6 text-center text-white/50">
        Queue is empty. Paste a YouTube link to get it going.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {party.queue.map((song, i) => {
        const voted = song.votes.includes(userId);
        return (
          <li
            key={song.id}
            className="card flex items-center gap-3 p-3"
          >
            <div className="w-6 text-center text-sm text-white/40">
              {i + 1}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={song.thumbnail}
              alt=""
              className="h-14 w-24 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug break-words">
                {song.title}
              </div>
              <div className="mt-0.5 text-xs text-white/50">
                Added by {song.addedBy}
              </div>
            </div>
            <button
              onClick={() => onVote(song)}
              className={
                "flex flex-col items-center rounded-lg px-3 py-1.5 text-sm transition " +
                (voted
                  ? "bg-brand-600 text-white"
                  : "bg-white/5 text-white hover:bg-white/10")
              }
              aria-pressed={voted}
              title={voted ? "Remove your vote" : "Upvote"}
            >
              <span aria-hidden>▲</span>
              <span className="text-xs font-semibold">
                {song.votes.length}
              </span>
            </button>
            {isAdmin ? (
              <div className="flex flex-shrink-0 flex-col gap-1">
                {onRemove ? (
                  <button
                    onClick={() => onRemove(song)}
                    className="btn-ghost !px-2 !py-1 text-xs"
                    title="Remove song from queue"
                  >
                    Remove
                  </button>
                ) : null}
                {onBan ? (
                  <button
                    onClick={() => onBan(song)}
                    className="rounded-md bg-red-600/80 px-2 py-1 text-xs font-medium hover:bg-red-500"
                    title="Ban this video from the party"
                  >
                    Ban
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
