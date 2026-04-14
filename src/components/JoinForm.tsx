"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clean = code.trim().toUpperCase();
    if (!clean) {
      setError("Enter a party code");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/party/${encodeURIComponent(clean)}`);
      if (!res.ok) {
        setError("We couldn't find that party. Double-check the code.");
        return;
      }
      router.push(`/party/${clean}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="e.g. 7K4MPQ"
        className="input text-center text-lg font-mono tracking-widest uppercase"
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
      />
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Checking…" : "Join party"}
      </button>
    </form>
  );
}
