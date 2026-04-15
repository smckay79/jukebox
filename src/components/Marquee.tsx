"use client";

import { useEffect, useRef, useState } from "react";

// Scrolling ticker that sits inline below the video. We render the text
// enough times to always overfill the container, then translate by exactly
// one "track" (half the rendered width) so the loop seams are invisible.
// The repeat count is recomputed on resize so the marquee stays full-width
// as the video/player resizes (mobile rotate, window resize, presenter mode).
export default function Marquee({ text }: { text?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [reps, setReps] = useState(4);

  useEffect(() => {
    if (!text) return;
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const recompute = () => {
      const cw = container.clientWidth;
      const tw = measure.offsetWidth;
      if (cw === 0 || tw === 0) return;
      // Need the single-track width to be >= container width so that after
      // translating by -50% of (two tracks) the second track is ready to
      // take over without a visible gap. Doubling gives us the two tracks.
      const perTrack = Math.max(2, Math.ceil(cw / tw) + 1);
      setReps((prev) => (prev === perTrack ? prev : perTrack));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    ro.observe(measure);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;

  // `reps` items per track; two tracks back-to-back so translating by -50%
  // wraps seamlessly. The first track has refs for measurement.
  const track = Array.from({ length: reps });

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-xl border border-white/10 bg-black/60 py-2 backdrop-blur"
      aria-label="Party message"
    >
      <div
        className="flex whitespace-nowrap font-medium tracking-wide text-white/90"
        style={{
          animation: "jukebox-marquee 30s linear infinite",
          willChange: "transform",
        }}
      >
        {/* First track — ref the first item so we can measure one unit. */}
        {track.map((_, i) => (
          <span
            key={`a-${i}`}
            ref={i === 0 ? measureRef : undefined}
            className="flex-shrink-0"
          >
            <span className="mx-8 inline-block">{text}</span>
            <span className="mx-8 inline-block">•</span>
          </span>
        ))}
        {/* Second track — identical copy, no refs. */}
        {track.map((_, i) => (
          <span key={`b-${i}`} className="flex-shrink-0">
            <span className="mx-8 inline-block">{text}</span>
            <span className="mx-8 inline-block">•</span>
          </span>
        ))}
      </div>
      <style jsx>{`
        @keyframes jukebox-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
