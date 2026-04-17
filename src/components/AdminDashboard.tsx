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
  subscription: {
    tier: "trial" | "pro" | "free";
    daysLeft: number;
    isOwner: boolean;
  };
}

interface AdminInvite {
  code: string;
  createdAt: number;
  createdByName: string;
  type: "admin" | "referral";
  maxUses: number;
  uses: number;
  grantDays: number;
  recipientEmail?: string;
  message?: string;
  expiresAt?: number;
  redeemedBy: { userId: string; email: string; redeemedAt: number }[];
  revokedAt?: number;
}

type Tab = "overview" | "parties" | "users" | "invites";

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
  const [invites, setInvites] = useState<AdminInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvites = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/invites");
      if (!res.ok) throw new Error("Failed to load invites");
      const data = await res.json();
      setInvites(data.invites);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

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
    Promise.all([fetchStats(), fetchParties(), fetchUsers(), fetchInvites()]).finally(() =>
      setLoading(false),
    );
  }, [fetchStats, fetchParties, fetchUsers, fetchInvites]);

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
            Promise.all([fetchStats(), fetchParties(), fetchUsers(), fetchInvites()]).finally(
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
        {(["overview", "parties", "users", "invites"] as Tab[]).map((t) => (
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
                : t === "users"
                  ? `Users (${users.length})`
                  : `Invites (${invites.length})`}
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
      {tab === "users" && <UsersTab users={users} onUpdate={fetchUsers} />}
      {tab === "invites" && (
        <InvitesTab invites={invites} onUpdate={fetchInvites} />
      )}
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

function TierBadge({ user }: { user: AdminUser }) {
  const { tier, daysLeft, isOwner } = user.subscription;
  if (isOwner) {
    return (
      <span className="chip bg-yellow-600/30 text-yellow-200 text-xs">
        Owner
      </span>
    );
  }
  if (tier === "pro") {
    return (
      <span className="chip bg-green-600/30 text-green-200 text-xs">
        Pro
      </span>
    );
  }
  if (tier === "trial") {
    return (
      <span className="chip bg-blue-600/30 text-blue-200 text-xs">
        Trial ({daysLeft}d left)
      </span>
    );
  }
  return (
    <span className="chip bg-white/10 text-white/50 text-xs">Free</span>
  );
}

function UsersTab({
  users,
  onUpdate,
}: {
  users: AdminUser[];
  onUpdate: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setSubscription(userId: string, action: string) {
    setBusyId(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}/subscription`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) onUpdate();
    } finally {
      setBusyId(null);
    }
  }

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
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{u.name}</p>
                  <TierBadge user={u} />
                </div>
                <p className="text-xs text-white/50">{u.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden text-right text-xs text-white/40 sm:block">
                  <p>Joined {formatTime(u.createdAt)}</p>
                  <p>Last login {timeAgo(u.lastLoginAt)}</p>
                </div>
                {!u.subscription.isOwner && (
                  <div className="flex gap-1">
                    {u.subscription.tier !== "pro" && (
                      <button
                        onClick={() => setSubscription(u.id, "setPro")}
                        disabled={busyId === u.id}
                        className="rounded bg-green-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-green-600"
                      >
                        Grant Pro
                      </button>
                    )}
                    {u.subscription.tier === "pro" && (
                      <button
                        onClick={() => setSubscription(u.id, "clear")}
                        disabled={busyId === u.id}
                        className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
                      >
                        Clear Override
                      </button>
                    )}
                    {u.subscription.tier !== "free" && (
                      <button
                        onClick={() => setSubscription(u.id, "revoke")}
                        disabled={busyId === u.id}
                        className="rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvitesTab({
  invites,
  onUpdate,
}: {
  invites: AdminInvite[];
  onUpdate: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [grantDays, setGrantDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recipientEmail: email || undefined,
          message: message || undefined,
          maxUses,
          grantDays,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const code = data.invite.code;
        const emailNote = data.emailResult?.ok
          ? ` — invite emailed to ${email}`
          : email
            ? ` — email failed, share the link manually`
            : "";
        setResult(`Created: ${code}${emailNote}`);
        setEmail("");
        setMessage("");
        setCreating(false);
        onUpdate();
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(code: string) {
    if (!confirm(`Revoke invite ${code}?`)) return;
    await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke", code }),
    });
    onUpdate();
  }

  const active = invites.filter((i) => !i.revokedAt);
  const revoked = invites.filter((i) => !!i.revokedAt);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Invite Codes</h2>
        <button
          onClick={() => setCreating((v) => !v)}
          className="btn-primary text-sm"
        >
          {creating ? "Cancel" : "Create invite"}
        </button>
      </div>

      {result && (
        <div className="rounded-lg bg-emerald-900/30 px-4 py-2 text-sm text-emerald-300">
          {result}
        </div>
      )}

      {creating && (
        <div className="card space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Recipient email (optional — sends invite email)
            </label>
            <input
              type="email"
              className="input w-full"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Personal message (optional)
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="Hey! You should check this out..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Max uses
              </label>
              <input
                type="number"
                className="input w-full"
                min={1}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">
                Grant days
              </label>
              <input
                type="number"
                className="input w-full"
                min={1}
                value={grantDays}
                onChange={(e) => setGrantDays(Number(e.target.value) || 90)}
              />
            </div>
          </div>
          <button
            onClick={create}
            disabled={busy}
            className="btn-primary w-full"
          >
            {busy ? "Creating..." : "Create & send invite"}
          </button>
        </div>
      )}

      {active.length === 0 && !creating ? (
        <p className="text-sm text-white/40">No invites created yet</p>
      ) : (
        <div className="space-y-2">
          {active.map((inv) => (
            <div key={inv.code} className="card p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-brand-300">
                      {inv.code}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        inv.type === "admin"
                          ? "bg-yellow-600/30 text-yellow-200"
                          : "bg-blue-600/30 text-blue-200"
                      }`}
                    >
                      {inv.type}
                    </span>
                    <span className="text-xs text-white/40">
                      {inv.uses}/{inv.maxUses === -1 ? "∞" : inv.maxUses} used
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {inv.grantDays}d Pro · by {inv.createdByName} ·{" "}
                    {timeAgo(inv.createdAt)}
                    {inv.recipientEmail && ` · to ${inv.recipientEmail}`}
                  </div>
                  {inv.redeemedBy.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {inv.redeemedBy.map((r) => (
                        <div
                          key={r.userId}
                          className="text-xs text-emerald-400"
                        >
                          Redeemed by {r.email} · {timeAgo(r.redeemedAt)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/invite/${inv.code}`,
                      );
                    }}
                    className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
                    title="Copy invite link"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() => revoke(inv.code)}
                    className="rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {revoked.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white/50">
            Revoked ({revoked.length})
          </h3>
          <div className="space-y-1">
            {revoked.map((inv) => (
              <div
                key={inv.code}
                className="card flex items-center gap-2 p-2 opacity-40"
              >
                <span className="font-mono text-xs">{inv.code}</span>
                <span className="text-xs text-white/40">
                  {inv.uses} used · revoked {timeAgo(inv.revokedAt!)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
