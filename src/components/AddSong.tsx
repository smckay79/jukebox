"use client";

import { useEffect, useState } from "react";
import {
  getDisplayName,
  getUserId,
  setDisplayName,
} from "@/lib/identity";
import type { PublicParty } from "@/lib/types";

export default function AddSong({
  code,
  onAdded,
}: {
  code: string;
  onAdded: (party: PublicParty) => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(getDisplayName());
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a YouTube link");
      return;
    }
    setBusy(true);
    try {
      const body = {
        url: trimmed,
        userId: getUserId(),
        addedBy: name.trim() || "Anonymous",
      };
      if (name.trim()) setDisplayName(name.trim());
      const res = await fetch(`/api/party/${code}/queue`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't add that one");
        return;
      }
      onAdded(data.party as PublicParty);
      setUrl("");
    } catch {
      setError("Network error — try again?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <div>
        <label className="mb-1 block text-sm text-white/70">
          Your name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="input"
          placeholder="Anonymous"
          maxLength={40}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm text-white/70">
          Add a YouTube link
        </label>
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/…"
            className="input flex-1"
          />
          <button className="btn-primary" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
        {error ? (
          <p className="mt-2 text-sm text-red-400">{error}</p>
        ) : null}
      </div>
    </form>
  );
}
