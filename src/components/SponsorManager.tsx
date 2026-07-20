"use client";

import { useCallback, useRef, useState } from "react";
import type { PublicParty } from "@/lib/types";

export default function SponsorManager({
  code,
  adminKey,
  party,
  onUpdated,
}: {
  code: string;
  adminKey: string;
  party: PublicParty;
  onUpdated: (party: PublicParty) => void;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      // Convert to data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        const imageUrl = e.target?.result as string;
        const title = file.name.replace(/\.[^/.]+$/, "").slice(0, 100);

        try {
          const res = await fetch(`/api/party/${code}/sponsors/add`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-admin-key": adminKey,
            },
            body: JSON.stringify({ imageUrl, title }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError((data as { error?: string }).error ?? "Failed to add sponsor");
            return;
          }

          onUpdated((data as { party: PublicParty }).party);
        } catch {
          setError("Network error");
        } finally {
          setUploading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setError("Failed to read file");
      setUploading(false);
    }
  };

  const removeSponsor = async (sponsorId: string) => {
    setRemoving(sponsorId);
    setError(null);
    try {
      const res = await fetch(`/api/party/${code}/sponsors/remove`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ sponsorId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Failed to remove sponsor");
        return;
      }

      onUpdated((data as { party: PublicParty }).party);
    } catch {
      setError("Network error");
    } finally {
      setRemoving(null);
    }
  };

  const sponsors = party.sponsors ?? [];

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Sponsors{" "}
          <span className="font-normal text-white/50">
            · rotating logos
            {sponsors.length > 0 ? ` · ${sponsors.length} added` : ""}
          </span>
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 text-xs">
          {error && <p className="text-red-400">{error}</p>}

          <div className="rounded-lg bg-white/5 p-2">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Add sponsor logo
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || sponsors.length >= 10}
              className="btn-primary w-full !py-2 text-sm"
            >
              {uploading ? "Uploading…" : "Upload logo"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <p className="mt-2 text-white/40">
              {sponsors.length}/10 sponsors · Upload PNG, JPG, or GIF logos
            </p>
          </div>

          {sponsors.length > 0 ? (
            <>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                Current sponsors
              </div>
              <ul className="space-y-2">
                {sponsors.map((sponsor) => (
                  <li
                    key={sponsor.id}
                    className="flex items-center gap-2 rounded bg-white/5 p-2"
                  >
                    <img
                      src={sponsor.imageUrl}
                      alt={sponsor.title || "Sponsor"}
                      className="h-8 w-auto flex-shrink-0 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-white/80">
                        {sponsor.title || "Sponsor"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeSponsor(sponsor.id)}
                      disabled={removing === sponsor.id}
                      className="rounded bg-white/10 px-2 py-1 text-white/70 hover:bg-red-600/60 hover:text-white"
                    >
                      {removing === sponsor.id ? "…" : "✕"}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {sponsors.length === 0 && !uploading && !error ? (
            <p className="text-white/50">
              Add sponsor logos to display on the party screen. Logos will rotate
              automatically.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
