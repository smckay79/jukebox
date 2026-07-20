"use client";

import { useEffect, useState } from "react";
import type { Sponsor } from "@/lib/types";

const ROTATION_INTERVAL_MS = 5000; // 5 seconds per sponsor

export default function SponsorDisplay({
  sponsors,
}: {
  sponsors?: Sponsor[];
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const count = sponsors?.length ?? 0;

  // Auto-rotate sponsors. Declared before any early return so the hook
  // order stays stable when the sponsor list appears/disappears.
  useEffect(() => {
    if (count <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % count);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [count]);

  // Keep the index in range if the list shrinks below the current index.
  useEffect(() => {
    if (currentIndex >= count && count > 0) setCurrentIndex(0);
  }, [count, currentIndex]);

  if (!sponsors || sponsors.length === 0) {
    return null;
  }

  const current = sponsors[currentIndex] ?? sponsors[0];

  return (
    <div className="fixed bottom-20 left-4 z-50 pointer-events-none">
      <div className="rounded-lg bg-white/10 backdrop-blur-sm p-3 text-center">
        <div className="text-[11px] uppercase tracking-wider text-white/50 mb-2">
          Sponsor
        </div>
        <div className="relative h-20 flex items-center justify-center">
          <img
            key={current.id}
            src={current.imageUrl}
            alt={current.title || "Sponsor"}
            className="max-h-20 max-w-full object-contain transition-opacity duration-500"
            style={{ animation: "fadeIn 0.5s ease-in" }}
          />
        </div>
        {current.title && (
          <div className="text-xs text-white/70 mt-2 truncate">
            {current.title}
          </div>
        )}
        {sponsors.length > 1 && (
          <div className="flex justify-center gap-1 mt-2">
            {sponsors.map((_, idx) => (
              <div
                key={idx}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  idx === currentIndex ? "bg-white/80 w-4" : "bg-white/30"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
