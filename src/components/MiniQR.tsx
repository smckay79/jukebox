"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function MiniQR({
  code,
  size = 96,
  bgColor,
}: {
  code: string;
  size?: number;
  bgColor?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = `${window.location.origin}/party/${code}`;
    QRCode.toDataURL(url, {
      margin: 1,
      width: size * 2,
      color: { dark: "#1a0b2e", light: "#ffffff" },
    }).then(setDataUrl);
  }, [code, size]);

  return (
    <div
      className="flex items-center gap-2 rounded-xl p-2 backdrop-blur"
      style={{ backgroundColor: bgColor ?? "rgba(0,0,0,0.7)" }}
    >
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
