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

interface AdminFlaggedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  firstFlaggedAt: number;
  lastFlaggedAt: number;
  skipCount: number;
  parties: string[];
  globallyBanned: boolean;
  dismissedAt?: number;
}

interface AdminSkipBumper {
  videoId: string;
  title: string;
  thumbnail: string;
  addedAt: number;
  enabled: boolean;
}

type Tab = "overview" | "parties" | "users" | "invites" | "waitlist" | "flagged" | "bumpers";

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
  const [flagged, setFlagged] = useState<AdminFlaggedVideo[]>([]);
  const [skipBumpers, setSkipBumpers] = useState<AdminSkipBumper[]>([]);
  const [waitlist, setWaitlist] = useState<{ email: string; createdAt: number }[]>([]);
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

  const fetchSkipBumpers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/skip-bumpers");
      if (!res.ok) throw new Error("Failed to load skip bumpers");
      const data = await res.json();
      setSkipBumpers(data.bumpers);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const fetchFlagged = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/flagged");
      if (!res.ok) throw new Error("Failed to load flagged videos");
      const data = await res.json();
      setFlagged(data.videos);
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

  const fetchWaitlist = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/waitlist");
      if (!res.ok) throw new Error("Failed to load waitlist");
      const data = await res.json();
      setWaitlist(data.entries);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchStats(), fetchParties(), fetchUsers(), fetchInvites(), fetchWaitlist(), fetchFlagged(), fetchSkipBumpers()]).finally(() =>
      setLoading(false),
    );
  }, [fetchStats, fetchParties, fetchUsers, fetchInvites, fetchWaitlist, fetchFlagged, fetchSkipBumpers]);

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
          <Link href="/">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-web.png" alt="VideoJam" className="h-6" />
          </Link>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            Promise.all([fetchStats(), fetchParties(), fetchUsers(), fetchInvites(), fetchFlagged(), fetchSkipBumpers()]).finally(
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
        {(["overview", "parties", "users", "invites", "waitlist", "flagged", "bumpers"] as Tab[]).map((t) => {
          const labels: Record<Tab, string> = {
            overview: "Overview",
            parties: `Parties (${parties.length})`,
            users: `Users (${users.length})`,
            invites: `Invites (${invites.length})`,
            waitlist: `Waitlist (${waitlist.length})`,
            flagged: `Flagged (${flagged.length})`,
            bumpers: `Bumpers (${skipBumpers.length})`,
          };
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? "bg-brand-600 text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              {labels[t]}
            </button>
          );
        })}
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
      {tab === "waitlist" && <WaitlistTab entries={waitlist} />}
      {tab === "flagged" && (
        <FlaggedTab videos={flagged} onUpdate={fetchFlagged} />
      )}
      {tab === "bumpers" && (
        <SkipBumpersTab bumpers={skipBumpers} onUpdate={fetchSkipBumpers} />
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

function SponsorLogoCard() {
  const [logo, setLogo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/sponsor-logo")
      .then((r) => r.json())
      .then((d: { logo?: string | null }) => setLogo(d.logo ?? null))
      .catch(() => {});
  }, []);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 400;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      setLogo(canvas.toDataURL("image/png"));
      setMsg(null);
    };
    img.src = url;
  }

  async function save() {
    if (!logo) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/sponsor-logo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ logo }),
      });
      const data = await res.json();
      setMsg(res.ok ? "Saved!" : (data.error ?? "Error saving"));
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    setMsg(null);
    try {
      await fetch("/api/admin/sponsor-logo", { method: "DELETE" });
      setLogo(null);
      setMsg("Cleared.");
    } catch {
      setMsg("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4">
      <h2 className="mb-3 text-lg font-semibold">Sponsor Logo</h2>
      <p className="mb-4 text-sm text-white/50">
        Shown in the top-left of the video screen on TV / Android display views.
        Resize to ~400 px max — the display shows it at 56 px tall.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo}
            alt="Sponsor logo preview"
            className="h-14 max-w-[180px] rounded bg-white/10 object-contain p-1"
          />
        ) : (
          <div className="flex h-14 w-36 items-center justify-center rounded bg-white/5 text-xs text-white/30">
            No logo set
          </div>
        )}
        <label className="btn-ghost cursor-pointer text-sm">
          Upload image
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </label>
        {logo && (
          <>
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium transition hover:bg-brand-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={clear}
              disabled={saving}
              className="btn-ghost text-sm text-red-400 hover:text-red-300"
            >
              Clear
            </button>
          </>
        )}
        {msg && <span className="text-sm text-white/60">{msg}</span>}
      </div>
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

      <SponsorLogoCard />

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
  const [customCode, setCustomCode] = useState("");
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
          customCode: customCode.trim() || undefined,
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
        setCustomCode("");
        setEmail("");
        setMessage("");
        setCreating(false);
        onUpdate();
      } else {
        setResult(data.error || "Failed to create invite");
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
              Custom code (optional — leave blank for random)
            </label>
            <input
              type="text"
              className="input w-full font-mono uppercase tracking-wider"
              placeholder="e.g. VIDEOJAM2026"
              value={customCode}
              onChange={(e) => setCustomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              maxLength={20}
            />
          </div>
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

function WaitlistTab({
  entries,
}: {
  entries: { email: string; createdAt: number }[];
}) {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);

  function copyAll() {
    const emails = sorted.map((e) => e.email).join("\n");
    navigator.clipboard.writeText(emails);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">
          Waitlist signups ({entries.length})
        </h2>
        {entries.length > 0 && (
          <button onClick={copyAll} className="btn-ghost text-sm">
            Copy all emails
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p className="text-white/50">No signups yet.</p>
      ) : (
        <div className="space-y-1">
          {sorted.map((e) => (
            <div
              key={e.email}
              className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2"
            >
              <span className="text-sm">{e.email}</span>
              <span className="text-xs text-white/40">
                {new Date(e.createdAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FlaggedTab({
  videos,
  onUpdate,
}: {
  videos: AdminFlaggedVideo[];
  onUpdate: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function action(videoId: string, act: string) {
    setBusyId(videoId);
    try {
      await fetch("/api/admin/flagged", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act, videoId }),
      });
      onUpdate();
    } finally {
      setBusyId(null);
    }
  }

  const banned = videos.filter((v) => v.globallyBanned);
  const pending = videos.filter((v) => !v.globallyBanned && !v.dismissedAt);
  const dismissed = videos.filter((v) => !v.globallyBanned && !!v.dismissedAt);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Flagged Videos</h2>
        <p className="mb-4 text-xs text-white/50">
          Songs crowd-skipped via downvote across all parties. Ban to block
          system-wide, or dismiss if it&apos;s fine.
        </p>
      </div>

      {pending.length === 0 && banned.length === 0 && dismissed.length === 0 ? (
        <p className="text-sm text-white/40">
          No crowd-skipped songs yet. When users downvote a playing song 3
          times, it appears here.
        </p>
      ) : null}

      {pending.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-yellow-300">
            Needs review ({pending.length})
          </h3>
          <div className="space-y-2">
            {pending.map((v) => (
              <FlaggedCard
                key={v.videoId}
                video={v}
                busyId={busyId}
                onAction={action}
              />
            ))}
          </div>
        </div>
      )}

      {banned.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-red-400">
            Globally banned ({banned.length})
          </h3>
          <div className="space-y-2">
            {banned.map((v) => (
              <FlaggedCard
                key={v.videoId}
                video={v}
                busyId={busyId}
                onAction={action}
              />
            ))}
          </div>
        </div>
      )}

      {dismissed.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white/40">
            Dismissed ({dismissed.length})
          </h3>
          <div className="space-y-1">
            {dismissed.map((v) => (
              <FlaggedCard
                key={v.videoId}
                video={v}
                busyId={busyId}
                onAction={action}
                dimmed
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FlaggedCard({
  video,
  busyId,
  onAction,
  dimmed,
}: {
  video: AdminFlaggedVideo;
  busyId: string | null;
  onAction: (videoId: string, action: string) => void;
  dimmed?: boolean;
}) {
  const isBusy = busyId === video.videoId;
  return (
    <div
      className={`card flex items-center gap-3 p-3 ${dimmed ? "opacity-50" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={video.thumbnail}
        alt=""
        className="h-12 w-20 flex-shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{video.title}</p>
        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-white/50">
          <span className="text-red-400">
            {video.skipCount} skip{video.skipCount !== 1 ? "s" : ""}
          </span>
          <span>
            {video.parties.length} part{video.parties.length !== 1 ? "ies" : "y"}
          </span>
          <span>Last: {timeAgo(video.lastFlaggedAt)}</span>
          {video.globallyBanned && (
            <span className="font-semibold text-red-400">BANNED</span>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 gap-1">
        {!video.globallyBanned ? (
          <>
            <button
              onClick={() => onAction(video.videoId, "ban")}
              disabled={isBusy}
              className="rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600"
            >
              Ban
            </button>
            {!video.dismissedAt && (
              <button
                onClick={() => onAction(video.videoId, "dismiss")}
                disabled={isBusy}
                className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
              >
                Dismiss
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => onAction(video.videoId, "unban")}
            disabled={isBusy}
            className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
          >
            Unban
          </button>
        )}
      </div>
    </div>
  );
}

function SkipBumpersTab({
  bumpers,
  onUpdate,
}: {
  bumpers: AdminSkipBumper[];
  onUpdate: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  async function add() {
    if (!url.trim()) return;
    setBusy(true);
    setAddError(null);
    try {
      const res = await fetch("/api/admin/skip-bumpers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "add", url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data.error ?? "Failed to add bumper");
        return;
      }
      setUrl("");
      setAdding(false);
      onUpdate();
    } finally {
      setBusy(false);
    }
  }

  async function remove(videoId: string) {
    if (!confirm("Remove this skip bumper?")) return;
    setBusyId(videoId);
    try {
      await fetch("/api/admin/skip-bumpers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "remove", videoId }),
      });
      onUpdate();
    } finally {
      setBusyId(null);
    }
  }

  async function toggle(videoId: string, enabled: boolean) {
    setBusyId(videoId);
    try {
      await fetch("/api/admin/skip-bumpers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle", videoId, enabled }),
      });
      onUpdate();
    } finally {
      setBusyId(null);
    }
  }

  const enabled = bumpers.filter((b) => b.enabled);
  const disabled = bumpers.filter((b) => !b.enabled);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold">Skip Bumpers</h2>
        <p className="mb-4 text-xs text-white/50">
          When a song is crowd-skipped (3 downvotes), one of these videos plays
          before the next song in queue. Add short clips, promos, or
          intermission bumpers.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">
          {enabled.length} active bumper{enabled.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => { setAdding((v) => !v); setAddError(null); }}
          className="btn-primary text-sm"
        >
          {adding ? "Cancel" : "Add bumper"}
        </button>
      </div>

      {adding && (
        <div className="card space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">
              YouTube URL or video ID
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="https://youtube.com/watch?v=... or dQw4w9WgXcQ"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") add(); }}
            />
          </div>
          {addError && (
            <p className="text-sm text-red-400">{addError}</p>
          )}
          <button
            onClick={add}
            disabled={busy || !url.trim()}
            className="btn-primary w-full"
          >
            {busy ? "Adding..." : "Add skip bumper"}
          </button>
        </div>
      )}

      {bumpers.length === 0 && !adding ? (
        <p className="text-sm text-white/40">
          No skip bumpers configured. Add a YouTube video to play after
          crowd-skipped songs.
        </p>
      ) : null}

      {enabled.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-green-400">
            Active ({enabled.length})
          </h3>
          <div className="space-y-2">
            {enabled.map((b) => (
              <SkipBumperCard
                key={b.videoId}
                bumper={b}
                busyId={busyId}
                onToggle={toggle}
                onRemove={remove}
              />
            ))}
          </div>
        </div>
      )}

      {disabled.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-white/40">
            Disabled ({disabled.length})
          </h3>
          <div className="space-y-2">
            {disabled.map((b) => (
              <SkipBumperCard
                key={b.videoId}
                bumper={b}
                busyId={busyId}
                onToggle={toggle}
                onRemove={remove}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SkipBumperCard({
  bumper,
  busyId,
  onToggle,
  onRemove,
}: {
  bumper: AdminSkipBumper;
  busyId: string | null;
  onToggle: (videoId: string, enabled: boolean) => void;
  onRemove: (videoId: string) => void;
}) {
  const isBusy = busyId === bumper.videoId;
  return (
    <div
      className={`card flex items-center gap-3 p-3 ${!bumper.enabled ? "opacity-50" : ""}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bumper.thumbnail}
        alt=""
        className="h-12 w-20 flex-shrink-0 rounded object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{bumper.title}</p>
        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-white/50">
          <span className="font-mono">{bumper.videoId}</span>
          <span>Added {timeAgo(bumper.addedAt)}</span>
          {bumper.enabled ? (
            <span className="font-semibold text-green-400">ACTIVE</span>
          ) : (
            <span className="text-white/40">DISABLED</span>
          )}
        </div>
      </div>
      <div className="flex flex-shrink-0 gap-1">
        <button
          onClick={() => onToggle(bumper.videoId, !bumper.enabled)}
          disabled={isBusy}
          className="rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/60 hover:bg-white/20"
        >
          {bumper.enabled ? "Disable" : "Enable"}
        </button>
        <button
          onClick={() => onRemove(bumper.videoId)}
          disabled={isBusy}
          className="rounded bg-red-600/80 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-600"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
