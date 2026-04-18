"use client";

import Marquee from "./Marquee";
import MiniQR from "./MiniQR";
import Player from "./Player";
import { getQRBackgroundColor } from "@/lib/background";
import { useMemo } from "react";
import type { PublicParty } from "@/lib/types";

export default function TVMode({
  party,
  userId,
  isAdmin,
  isPro,
  onEnded,
  onSkip,
  onDownvote,
  onGoldenDownvote,
  onExit,
}: {
  party: PublicParty;
  userId: string;
  isAdmin: boolean;
  isPro: boolean;
  onEnded: (videoId: string) => void;
  onSkip: () => void;
  onDownvote?: () => void;
  onGoldenDownvote?: () => void;
  onExit: () => void;
}) {
  const qrBg = useMemo(
    () => getQRBackgroundColor(party.theme),
    [party.theme],
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      {/* Up-next strip */}
      <div className="flex h-12 flex-shrink-0 items-center gap-3 bg-black/80 px-4">
        {party.queue[0] ? (
          <>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Up next
            </span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={party.queue[0].thumbnail}
              alt=""
              className="h-8 w-14 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1 truncate text-sm">
              {party.queue[0].title}
            </div>
            <span className="flex-shrink-0 text-xs text-white/50">
              Added by {party.queue[0].addedBy}
            </span>
          </>
        ) : (
          <span className="text-xs text-white/40">
            Queue is empty — scan the QR to add a song.
          </span>
        )}
      </div>

      {/* Player area */}
      <div className="relative min-h-0 flex-1 bg-black">
        <Player
          song={party.nowPlaying}
          onEnded={onEnded}
          partyCode={party.code}
          fill
          downvotes={party.nowPlaying?.downvotes?.length ?? 0}
          goldenSkip={party.nowPlaying?.goldenSkip ?? false}
          onDownvote={isPro ? onDownvote : undefined}
          onGoldenDownvote={isAdmin ? onGoldenDownvote : undefined}
          canDownvote={isPro && !!party.nowPlaying}
          hasDownvoted={
            party.nowPlaying?.downvotes?.includes(userId) ?? false
          }
          isHost={isAdmin}
        />
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/90 to-transparent" />

        {/* QR overlay — bottom-right */}
        <div className="pointer-events-none absolute bottom-4 right-4">
          <MiniQR code={party.code} size={96} bgColor={qrBg} />
        </div>

        {/* Host controls — bottom-left */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          {isAdmin && party.nowPlaying ? (
            <button
              onClick={onSkip}
              className="rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white/70 backdrop-blur transition hover:bg-black/80 hover:text-white"
            >
              ▶▶ Skip
            </button>
          ) : null}
          <button
            onClick={onExit}
            className="rounded-xl bg-black/60 px-4 py-2 text-sm font-medium text-white/70 backdrop-blur transition hover:bg-black/80 hover:text-white"
          >
            ✕ Exit TV Mode
          </button>
        </div>
      </div>

      {/* Marquee */}
      <div className="flex-shrink-0">
        <Marquee text={party.marquee} />
      </div>
    </div>
  );
}
