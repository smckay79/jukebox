"use client";

import { useEffect, useRef, useState } from "react";
import type { Sponsor, SponsorLabel } from "@/lib/types";

export default function SponsorDisplay({
  sponsors,
  label,
  songKey,
}: {
  sponsors?: Sponsor[];
  label?: SponsorLabel;
  // Identifier for the currently playing song. The logo advances to the
  // next sponsor each time this changes (i.e. when the song changes).
  songKey?: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const count = sponsors?.length ?? 0;
  const prevSongKey = useRef<string | undefined>(undefined);

  // Advance to the next sponsor whenever the song changes. Declared before
  // any early return so the hook order stays stable when the list appears/
  // disappears. The first song seen keeps index 0 (no advance on mount).
  useEffect(() => {
    if (count <= 1) {
      prevSongKey.current = songKey;
      return;
    }
    if (prevSongKey.current === undefined) {
      prevSongKey.current = songKey;
      return;
    }
    if (songKey !== prevSongKey.current) {
      prevSongKey.current = songKey;
      setCurrentIndex((prev) => (prev + 1) % count);
    }
  }, [songKey, count]);

  // Keep the index in range if the list shrinks below the current index.
  useEffect(() => {
    if (currentIndex >= count && count > 0) setCurrentIndex(0);
  }, [count, currentIndex]);

  if (!sponsors || sponsors.length === 0) {
    return null;
  }

  const current = sponsors[currentIndex] ?? sponsors[0];

  // Label appearance — text defaults to "Sponsor"; empty string hides it.
  const labelText = label?.text ?? "Sponsor";
  const labelColor = label?.color ?? "#ffffff";
  const labelOpacity = (label?.brightness ?? 60) / 100;

  return (
    <div className="absolute bottom-4 left-4 z-50 pointer-events-none">
      <div className="text-center">
        {labelText ? (
          <div
            className="text-[11px] uppercase tracking-wider mb-2"
            style={{ color: labelColor, opacity: labelOpacity }}
          >
            {labelText}
          </div>
        ) : null}
        <div className="relative h-14 flex items-center justify-center">
          <img
            key={current.id}
            src={current.imageUrl}
            alt={current.title || "Sponsor"}
            className="max-h-14 max-w-full object-contain transition-opacity duration-500"
            style={{ animation: "fadeIn 0.5s ease-in" }}
          />
        </div>
      </div>
    </div>
  );
}
