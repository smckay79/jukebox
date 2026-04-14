"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Tiny QR used as an in-player overlay so latecomers can scan without
// having to click "Show QR". Renders a compact "Join · CODE" label next to
// the code itself. Fixed white-on-dark styling regardless of party theme so
// it reads well against any video still.
export default function MiniQR({
  code,
  size = 96,
}: {
  code: string;
  size?: number;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/party/${code}`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: size * 2, // render 2x for crispness on hi-dpi
      color: { dark: "#1a0b2e", light: "#ffffff" },
    }).then(setDataUrl);
  }, [code, size]);

  return (
    <div className="flex items-center gap-2 rounded-xl bg-black/70 p-2 backdrop-blur">
      <div className="rounded-md bg-white p-1">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={dataUrl}
            alt="Join QR"
            width={size}
            height={size}
            className="block"
          />
        ) : (
          <div
            className="animate-pulse bg-white/30"
            style={{ width: size, height: size }}
          />
        )}
      </div>
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider text-white/60">
          Join
        </div>
        <div className="font-mono text-sm font-bold tracking-widest text-white">
          {code}
        </div>
      </div>
    </div>
  );
}
