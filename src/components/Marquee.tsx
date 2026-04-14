"use client";

// Scrolling ticker fixed to the bottom of the viewport. Doubled text in
// the animation so the loop joins seamlessly without a visible reset.
// Hidden on mobile since it's meant for the TV cast; guests already see
// party info in the compact layout.
export default function Marquee({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 hidden overflow-hidden border-t border-white/10 bg-black/70 py-2 backdrop-blur md:block"
      aria-hidden
    >
      <div
        className="whitespace-nowrap font-medium tracking-wide text-white/90"
        style={{
          animation: "jukebox-marquee 30s linear infinite",
          willChange: "transform",
        }}
      >
        <span className="mx-8 inline-block">{text}</span>
        <span className="mx-8 inline-block">•</span>
        <span className="mx-8 inline-block">{text}</span>
        <span className="mx-8 inline-block">•</span>
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
