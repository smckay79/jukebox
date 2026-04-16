"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Stats {
  totalUsers: number;
  totalParties: number;
  activeParties: number;
  endedParties: number;
  totalSongsPlayed: number;
  totalSecondsPlayed: number;
  totalHoursPlayed: number;
  topSongs: {
    videoId: string;
    title: string;
    thumbnail: string;
    count: number;
  }[];
}

interface AdminParty {
  code: string;
  name: string;
  createdAt: number;
  endedAt?: number;
  hostUserId: string | null;
  queueSize: number;
  nowPlaying: string | null;
  historyCount: number;
  totalSeconds: number;
  viewers: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  lastLoginAt: number;
}

type Tab = "overview" | "parties" | "users";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(epoch: number): string {
  return new Date(epoch).toLocaleString();
}

function timeAgo(epoch: number): string {
  const diff = Date.now() - epoch;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [parties, setParties] = useState<AdminParty[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats");
      if (!res.ok) throw new Error("Failed to load stats");
      setStats(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/parties");
      if (!res.ok) throw new Error("Failed to load parties");
      const data = await res.json();
      setParties(data.parties);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to load users");
      const data = await res.json();
      setUsers(data.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStats(), fetchParties(), fetchUsers()]).finally(() =>
      setLoading(false),
    );
  }, [fetchStats, fetchParties, fetchUsers]);

  async function endParty(code: string) {
    if (!confirm(`End party ${code}?`)) return;
    const res = await fetch(`/api/admin/parties/${code}/end`, {
      method: "POST",
    });
    if (res.ok) {
      await Promise.all([fetchStats(), fetchParties()]);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Admin Portal</h1>
        <p className="text-white/60">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold">Admin Portal</h1>
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  const activeParties = parties.filter((p) => !p.endedAt);
  const endedParties = parties.filter((p) => !!p.endedAt);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest text-white/40 hover:text-white/70"
          >
            Jukebox
          </Link>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            Promise.all([fetchStats(), fetchParties(), fetchUsers()]).finally(
              () => setLoading(false),
            );
          }}
          className="btn-ghost text-sm"
        >
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-white/5 p-1">
        {(["overview", "parties", "users"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === t
                ? "bg-brand-600 text-white"
                : "text-white/60 hover:text-white"
            }`}
          >
            {t === "overview"
              ? "Overview"
              : t === "parties"
                ? `Parties (${parties.length})`
                : `Users (${users.length})`}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && <OverviewTab stats={stats} />}
      {tab === "parties" && (
        <PartiesTab
          active={activeParties}
          ended={endedParties}
          onEnd={endParty}
        />
      )}
      {tab === "users" && <UsersTab users={users} />}
    </main>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-white/50">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-white/40">{sub}</p>}
    </div>
  );
}

function OverviewTab({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="User Accounts" value={stats.totalUsers} />
        <StatCard
          label="Total Parties"
          value={stats.totalParties}
          sub={`${stats.activeParties} active, ${stats.endedParties} ended`}
        />
        <StatCard label="Songs Played" value={stats.totalSongsPlayed} />
        <StatCard
          label="Hours of Music"
          value={stats.totalHoursPlayed}
          sub={formatDuration(stats.totalSecondsPlayed)}
        />
      </div>

      {/* Top Songs */}
      {stats.topSongs.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-3 text-lg font-semibold">
            Top Songs Across All Parties
          </h2>
          <div className="space-y-2">
            {stats.topSongs.map((song, i) => (
              <div
                key={song.videoId}
                className="flex items-center gap-3 rounded-lg bg-white/5 p-2"
              >
                <span className="w-6 text-right text-sm font-bold text-white/40">
                  {i + 1}
                </span>
                <img
                  src={song.thumbnail}
                  alt=""
                  className="h-10 w-14 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>
                </div>
                <span className="whitespace-nowrap text-sm text-brand-300">
                  {song.count} play{song.count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PartiesTab({
  active,
  ended,
  onEnd,
}: {
  active: AdminParty[];
  ended: AdminParty[];
  onEnd: (code: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Active Parties */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">
          Active Parties ({active.length})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-white/40">No active parties</p>
        ) : (
          <div className="space-y-2">
            {active.map((p) => (
              <div
                key={p.code}
                className="card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-300">
                      {p.code}
                    </span>
                    <span className="font-medium">{p.name}</span>
                    {p.hostUserId && (
                      <span className="chip bg-green-600/30 text-green-200 text-xs">
                        signed-in host
                      </span>
                    )}
                    {!p.hostUserId && (
                      <span className="chip bg-yellow-600/30 text-yellow-200 text-xs">
                        anonymous
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/50">
                    <span>Started {timeAgo(p.createdAt)}</span>
                    <span>{p.viewers} viewer{p.viewers !== 1 ? "s" : ""}</span>
                    <span>{p.queueSize} in queue</span>
                    <span>{p.historyCount} played</span>
                    {p.nowPlaying && (
                      <span className="text-white/70">
                        Now: {p.nowPlaying}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/party/${p.code}`}
                    className="btn-ghost text-xs"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => onEnd(p.code)}
                    className="rounded-md bg-red-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-red-600"
                  >
                    End
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ended Parties */}
      {ended.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            Ended Parties ({ended.length})
          </h2>
          <div className="space-y-2">
            {ended.map((p) => (
              <div
                key={p.code}
                className="card flex flex-wrap items-center justify-between gap-3 p-4 opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-white/50">
                      {p.code}
                    </span>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-white/40">
                    <span>Created {formatTime(p.createdAt)}</span>
                    <span>Ended {formatTime(p.endedAt!)}</span>
                    <span>{p.historyCount} songs played</span>
                    <span>{formatDuration(p.totalSeconds)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UsersTab({ users }: { users: AdminUser[] }) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">
        Registered Users ({users.length})
      </h2>
      {users.length === 0 ? (
        <p className="text-sm text-white/40">No registered users yet</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className="card flex items-center gap-3 p-3">
              {u.picture ? (
                <img
                  src={u.picture}
                  alt=""
                  className="h-9 w-9 rounded-full"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-sm font-bold">
                  {u.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-white/50">{u.email}</p>
              </div>
              <div className="text-right text-xs text-white/40">
                <p>Joined {formatTime(u.createdAt)}</p>
                <p>Last login {timeAgo(u.lastLoginAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
