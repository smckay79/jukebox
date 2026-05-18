"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PartySnapshot } from "@/lib/store";

export default function ResurrectPartySection() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PartySnapshot[]>([]);
  const [resurrecting, setResurrecting] = useState<string | null>(null);

  useEffect(() => {
    loadPartyHistory();
  }, []);

  async function loadPartyHistory() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/party/history", { cache: "no-store" });
      if (res.status === 401) {
        // Not signed in
        setHistory([]);
        setLoading(false);
        return;
      }
      if (res.status === 403) {
        // Not a paid user
        setHistory([]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError("Couldn't load party history");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { history: PartySnapshot[] };
      setHistory(data.history ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function resurrectParty(code: string) {
    setResurrecting(code);
    setError(null);
    try {
      const res = await fetch("/api/party/resurrect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        setError(
          data.error === "party-not-found"
            ? "Party not found"
            : "Couldn't resurrect party",
        );
        setResurrecting(null);
        return;
      }
      const data = (await res.json()) as {
        code: string;
        adminKey: string;
        adminPin: string;
        name: string;
      };

      // Save the new party credentials
      const { setAdminKey, setAdminPin } = await import("@/lib/identity");
      setAdminKey(data.code, data.adminKey);
      setAdminPin(data.code, data.adminPin);

      // Navigate to the new party
      router.push(`/party/${data.code}?host=1`);
    } catch {
      setError("Network error");
      setResurrecting(null);
    }
  }

  if (loading) {
    return null;
  }

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="card p-6">
      <h2 className="mb-2 text-xl font-semibold">
        Resurrect an old party
      </h2>
      <p className="mb-4 text-sm text-white/60">
        Start a new party with all your previous settings, bumpers, and playlist.
      </p>

      {error && <p className="mb-3 text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {history.map((party) => {
          const ago = formatAgo(party.createdAt);
          return (
            <div
              key={party.code}
              className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 hover:bg-white/10"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{party.name}</div>
                <div className="text-xs text-white/60">
                  {ago} · Code: {party.code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => resurrectParty(party.code)}
                disabled={resurrecting === party.code}
                className="btn-primary ml-3 !px-3 !py-1 text-sm whitespace-nowrap"
              >
                {resurrecting === party.code ? "Creating…" : "Resurrect"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAgo(at: number): string {
  const ms = Date.now() - at;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const months = Math.floor(d / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
