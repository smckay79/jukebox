"use client";

// Scrolling ticker that sits inline below the video. Doubled text in the
// animation so the loop joins seamlessly without a visible reset. Caller
// controls placement; returns null when the host hasn't set a message.
export default function Marquee({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/10 bg-black/60 py-2 backdrop-blur"
      aria-label="Party message"
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
