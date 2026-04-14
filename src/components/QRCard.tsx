"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function QRCard({ code }: { code: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const url = `${window.location.origin}/party/${code}`;
    setJoinUrl(url);
    QRCode.toDataURL(url, {
      margin: 1,
      width: 280,
      color: { dark: "#1a0b2e", light: "#ffffff" },
    }).then(setDataUrl);
  }, [code]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="card flex flex-col items-center gap-3 p-5">
      <div className="text-sm text-white/60">Party code</div>
      <div className="font-mono text-3xl tracking-widest">{code}</div>
      <div className="rounded-xl bg-white p-3">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt="Join QR code" width={240} height={240} />
        ) : (
          <div className="h-[240px] w-[240px] animate-pulse rounded bg-white/10" />
        )}
      </div>
      <div className="flex w-full items-center gap-2">
        <input
          readOnly
          value={joinUrl}
          className="input flex-1 text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="btn-ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
