"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setAdminKey, setDisplayName } from "@/lib/identity";

export default function CreatePartyForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/party", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        setError("Couldn't create the party. Try again?");
        return;
      }
      const data = (await res.json()) as {
        code: string;
        adminKey: string;
        name: string;
      };
      setAdminKey(data.code, data.adminKey);
      if (host.trim()) setDisplayName(host.trim());
      router.push(`/party/${data.code}?host=1`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-sm text-white/70">Party name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Alex's birthday"
          className="input"
          maxLength={60}
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm text-white/70">Your name (host)</span>
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="DJ Alex"
          className="input"
          maxLength={40}
        />
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Spinning up…" : "Start party"}
      </button>
    </form>
  );
}
