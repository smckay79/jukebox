"use client";

import { useCallback, useEffect, useState } from "react";
import type { ActivityEntry, IpBan } from "@/lib/stats";

interface StatsPayload {
  viewers: number;
  activity: ActivityEntry[];
  ipBans: IpBan[];
}

// Host-only stats panel. Polls /stats every 10s for live viewer count,
// recent add activity (per IP), and currently-muted IPs. Lets the host
// one-click mute an IP for an hour — the /queue route rejects adds from
// muted IPs, and the ban expires on its own.
export default function AdminStats({
  code,
  adminKey,
}: {
  code: string;
  adminKey: string;
}) {
  const [data, setData] = useState<StatsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/party/${code}/stats`, {
        cache: "no-store",
        headers: { "x-admin-key": adminKey },
      });
      if (!res.ok) {
        setError(res.status === 403 ? "Not authorized" : "Couldn't load stats");
        return;
      }
      const d = (await res.json()) as StatsPayload;
      setData(d);
      setError(null);
    } catch {
      setError("Network error");
    }
  }, [code, adminKey]);

  // Poll while the panel is open; drop the timer when collapsed so an
  // idle admin tab isn't hammering the endpoint.
  useEffect(() => {
    if (!open) return;
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [open, load]);

  async function setBan(ip: string, action: "banIp" | "unbanIp") {
    if (!ip) return;
    setBusy(`${action}:${ip}`);
    try {
      const res = await fetch(`/api/party/${code}/admin`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": adminKey,
        },
        body: JSON.stringify({ action, ip }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setError(d.error ?? "Action failed");
      } else {
        setError(null);
        load();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  const bannedIps = new Set((data?.ipBans ?? []).map((b) => b.ip));

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Host stats{" "}
          {data ? (
            <span className="font-normal text-white/50">
              · {data.viewers} watching
              {data.ipBans.length > 0 ? ` · ${data.ipBans.length} muted` : ""}
            </span>
          ) : null}
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>

      {open ? (
        <div className="mt-3 space-y-3 text-xs">
          {error ? <p className="text-red-400">{error}</p> : null}

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Watching now
              </div>
              <div className="text-lg font-semibold">{data?.viewers ?? "—"}</div>
            </div>
            <div className="rounded-md bg-white/5 px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40">
                Muted IPs
              </div>
              <div className="text-lg font-semibold">
                {data?.ipBans.length ?? 0}
              </div>
            </div>
          </div>

          {data?.ipBans && data.ipBans.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Currently muted
              </div>
              <ul className="space-y-1">
                {data.ipBans.map((b) => (
                  <li
                    key={b.ip}
                    className="flex items-center justify-between rounded bg-white/5 px-2 py-1"
                  >
                    <span className="font-mono text-white/80">{b.ip}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white/50">
                        lifts {formatIn(b.until)}
                      </span>
                      <button
                        type="button"
                        disabled={busy === `unbanIp:${b.ip}`}
                        onClick={() => setBan(b.ip, "unbanIp")}
                        className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
                      >
                        Unmute
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Recent adds
            </div>
            {data?.activity && data.activity.length > 0 ? (
              <ul className="max-h-64 space-y-1 overflow-auto">
                {data.activity.map((a, i) => {
                  const muted = bannedIps.has(a.ip);
                  return (
                    <li
                      key={`${a.at}-${i}`}
                      className="flex items-start justify-between gap-2 rounded bg-white/5 px-2 py-1"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-white/90">{a.title}</div>
                        <div className="truncate text-white/50">
                          {a.addedBy} · <span className="font-mono">{a.ip}</span>{" "}
                          · {formatAgo(a.at)}
                        </div>
                      </div>
                      {muted ? (
                        <button
                          type="button"
                          disabled={busy === `unbanIp:${a.ip}`}
                          onClick={() => setBan(a.ip, "unbanIp")}
                          className="flex-shrink-0 rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
                        >
                          Unmute
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            busy === `banIp:${a.ip}` || a.ip === "unknown"
                          }
                          onClick={() => setBan(a.ip, "banIp")}
                          className="flex-shrink-0 rounded bg-red-600/70 px-2 py-0.5 text-white hover:bg-red-500"
                          title="Mute this IP from adding songs for 1 hour"
                        >
                          Mute 1h
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-white/50">No adds yet.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatAgo(at: number): string {
  const s = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function formatIn(at: number): string {
  const s = Math.max(0, Math.floor((at - Date.now()) / 1000));
  if (s < 60) return `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  return `in ${h}h`;
}
