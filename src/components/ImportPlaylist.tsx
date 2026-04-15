"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import EditPlaylistModal from "./EditPlaylistModal";
import { getAdminKey } from "@/lib/identity";
import type {
  PublicParty,
  PublicUser,
  SavedPlaylistSummary,
} from "@/lib/types";

// A single row in the preview list. Works for both sources: YouTube
// rows carry their real videoId and are playable as-is; Spotify rows
// carry a synthetic "sp:<id>" key in videoId and aren't playable until
// a YouTube match comes back for them.
interface PreviewItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  // Filled in by the server from videos.list regionRestriction; when false
  // we flag the row and exclude it from the default selection.
  available?: boolean;
  unavailableReason?: string;
  // "yt" (default, omitted on legacy rows) means the videoId is a real
  // playable YouTube ID. "sp" means the row came from a Spotify import
  // and must have a match before it can be queued.
  source?: "yt" | "sp";
  // Spotify rows stash the primary artist here so we can show it on
  // the preview and send it with the match request. Ignored for yt.
  artist?: string;
}

interface MatchCandidate {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
  durationSeconds?: number;
  score: number;
}

// Matching runs this many lookups in parallel. Innertube is free of quota
// but round-trips take ~500ms-1s, so the batch size mostly trades latency
// for politeness. 6 keeps a 100-song playlist matched in ~15s.
const MATCH_CONCURRENCY = 6;

// "1:23" / "42:05" style, used to back-fill durations for Spotify rows
// (the API gives us ms; YouTube rows come pre-formatted).
function formatSeconds(s: number): string {
  if (!s || s < 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Collapsible card that lets the host paste a YouTube / YouTube Music
// playlist URL (or ID), preview the tracks, pick which ones to keep, and
// set them as the party's background playlist. The tracks loop whenever
// the user queue is empty; any user-added song interrupts and ranks
// higher. After the preview loads, a background worker tries to automatch
// each item against its official music video (for YouTube Music "- Topic"
// auto-audio entries) via the /api/youtube/match endpoint.
export default function ImportPlaylist({
  code,
  bannedIds,
  onImported,
  country,
  authUser,
  isAdmin,
  refreshKey,
}: {
  code: string;
  bannedIds: Set<string>;
  onImported: (party: PublicParty) => void;
  country?: string;
  // Signed-in user, if any. When present we expose the save/load saved-
  // playlist affordances; when null we just hide them (no pressure to
  // sign in beyond the header hint).
  authUser?: PublicUser | null;
  // Admin-only actions like "Load into party" require the admin key. We
  // still show the list to non-admin owners so they can see/manage their
  // own library; the Load button is just gated.
  isAdmin?: boolean;
  // Bumped by the parent when something outside this component changed
  // the saved-playlists list (e.g. PartyHistory just saved one). We
  // re-fetch whenever it changes.
  refreshKey?: number;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  // Which import source to pull a playlist from. Both produce the same
  // PreviewItem shape downstream, just with different fetch + match
  // endpoints. Switching tabs clears in-flight preview state.
  const [source, setSource] = useState<"youtube" | "spotify">("youtube");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // videoId of the original preview item -> the matched music-video
  // candidate we found (or null once we've tried and given up).
  const [matches, setMatches] = useState<Map<string, MatchCandidate | null>>(
    new Map(),
  );
  // How many items we've attempted to match. Combined with items.length this
  // drives the "Matching music videos… 42/99" progress line.
  const [matchProgress, setMatchProgress] = useState({ done: 0, total: 0 });
  const [matchEnabled, setMatchEnabled] = useState(true);
  // videoId of originals the user explicitly wants to keep as-is (even
  // though a match was found). Default behavior: use the match if present.
  const [keepOriginal, setKeepOriginal] = useState<Set<string>>(new Set());
  // Two-letter country code the server used to evaluate regionRestriction.
  // Shown inline on the "N unavailable in your region" line so the host
  // knows which country we checked against.
  const [region, setRegion] = useState<string | null>(null);

  // A ref + generation counter so we can cancel a match pass when the user
  // loads a different playlist mid-flight.
  const matchGen = useRef(0);

  // Mirror bannedIds into a ref so the match worker can evaluate
  // "is the match banned?" against the current set without us having to
  // include bannedIds in startMatching's deps (which would re-trigger the
  // whole match pass every time the banned set changes).
  const bannedIdsRef = useRef(bannedIds);
  useEffect(() => {
    bannedIdsRef.current = bannedIds;
  }, [bannedIds]);

  // --- Saved (user-owned) playlists ---
  // Populated from /api/playlists when the user signs in. We only fetch
  // once per signed-in session; create/delete updates the list locally.
  const [savedPlaylists, setSavedPlaylists] = useState<
    SavedPlaylistSummary[]
  >([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [busyPlaylistId, setBusyPlaylistId] = useState<string | null>(null);
  // Save-as-playlist flow: textbox for the new name + in-flight flag.
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  // When set, open the edit-playlist modal. Cleared on close/save.
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(
    null,
  );

  const loadSavedPlaylists = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await fetch("/api/playlists", { cache: "no-store" });
      if (!res.ok) {
        if (res.status !== 401) setSavedError("Couldn't load your playlists");
        setSavedPlaylists([]);
        return;
      }
      const data = (await res.json()) as { playlists?: SavedPlaylistSummary[] };
      setSavedPlaylists(data.playlists ?? []);
    } catch {
      setSavedError("Network error");
    } finally {
      setSavedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authUser) loadSavedPlaylists();
    else setSavedPlaylists([]);
  }, [authUser, loadSavedPlaylists, refreshKey]);

  async function loadSavedIntoParty(id: string) {
    const key = getAdminKey(code);
    if (!key) {
      setSavedError("Only the host can load a playlist into the party.");
      return;
    }
    setBusyPlaylistId(id);
    setSavedError(null);
    try {
      const res = await fetch(`/api/party/${code}/load-playlist`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-key": key,
        },
        body: JSON.stringify({ playlistId: id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSavedError(
          (data as { error?: string }).error ?? "Couldn't load that playlist",
        );
        return;
      }
      onImported((data as { party: PublicParty }).party);
      const count = (data as { count?: number }).count ?? 0;
      setFlash(
        `Loaded ${count} track${count === 1 ? "" : "s"} from your playlist.`,
      );
    } catch {
      setSavedError("Network error");
    } finally {
      setBusyPlaylistId(null);
    }
  }

  async function deleteSavedPlaylist(id: string, name: string) {
    if (!confirm(`Delete playlist "${name}"? This can't be undone.`)) return;
    setBusyPlaylistId(id);
    setSavedError(null);
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSavedError(data.error ?? "Couldn't delete that playlist");
        return;
      }
      setSavedPlaylists((ps) => ps.filter((p) => p.id !== id));
    } catch {
      setSavedError("Network error");
    } finally {
      setBusyPlaylistId(null);
    }
  }

  async function saveSelectionAsPlaylist() {
    if (!items || selected.size === 0) return;
    const name = saveName.trim();
    if (!name) {
      setError("Give your playlist a name first.");
      return;
    }
    setSaving(true);
    setError(null);
    setFlash(null);
    const picks = items
      .filter((it) => selected.has(it.videoId))
      .map((it) => effectiveFor(it))
      .filter(
        (p): p is { videoId: string; title: string; thumbnail: string } =>
          p !== null,
      );
    if (picks.length === 0) {
      setError(
        "None of the selected tracks have a playable match yet. Wait for matching to finish or tweak your selection.",
      );
      setSaving(false);
      return;
    }
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, items: picks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't save");
        return;
      }
      setFlash(`Saved "${name}" to your playlists.`);
      setSaveName("");
      loadSavedPlaylists();
    } catch {
      setError("Network error — try again?");
    } finally {
      setSaving(false);
    }
  }

  async function loadPlaylist(e: React.FormEvent) {
    e.preventDefault();
    const v = raw.trim();
    if (!v) return;
    setLoading(true);
    setError(null);
    setFlash(null);
    setItems(null);
    setMatches(new Map());
    setMatchProgress({ done: 0, total: 0 });
    setKeepOriginal(new Set());
    // Bump generation so any in-flight match worker from a previous load
    // sees the change and bails out.
    matchGen.current += 1;
    try {
      if (source === "spotify") {
        const qs = new URLSearchParams({ id: v });
        const res = await fetch(`/api/spotify/playlist?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            (data as { error?: string }).error ??
              "Couldn't load that Spotify playlist",
          );
          return;
        }
        const tracks =
          (
            data as {
              tracks?: Array<{
                id: string;
                title: string;
                artists: string[];
                album: string;
                durationSeconds: number;
                thumbnail: string;
              }>;
            }
          ).tracks ?? [];
        // Synthetic "sp:<id>" keys keep row identity stable without
        // colliding with any real YouTube id. Match comes later and fills
        // in the playable videoId.
        const mapped: PreviewItem[] = tracks.map((t) => ({
          videoId: `sp:${t.id}`,
          title: t.title,
          channelTitle: t.artists.join(", ") || t.album,
          thumbnail: t.thumbnail,
          duration: formatSeconds(t.durationSeconds),
          durationSeconds: t.durationSeconds,
          source: "sp",
          artist: t.artists[0],
        }));
        setItems(mapped);
        setRegion(null);
        // Optimistically select every Spotify row. Rows without a match
        // get filtered out at submit time, and a "No match found" badge
        // makes the situation obvious in the UI.
        setSelected(new Set(mapped.map((r) => r.videoId)));
      } else {
        const qs = new URLSearchParams({ id: v });
        if (country) qs.set("country", country);
        const res = await fetch(`/api/youtube/playlist?${qs.toString()}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            (data as { error?: string }).error ?? "Couldn't load that playlist",
          );
          return;
        }
        const results = (data as { results?: PreviewItem[] }).results ?? [];
        const reg = (data as { region?: string }).region ?? null;
        const tagged: PreviewItem[] = results.map((r) => ({
          ...r,
          source: "yt",
        }));
        setItems(tagged);
        setRegion(reg);
        const next = new Set<string>();
        for (const r of tagged) {
          if (!bannedIds.has(r.videoId) && r.available !== false) {
            next.add(r.videoId);
          }
        }
        setSelected(next);
      }
    } catch {
      setError("Network error — try again?");
    } finally {
      setLoading(false);
    }
  }

  // Kick off the match worker whenever items load. Cancellation uses the
  // generation counter so a superseded pass can silently bow out.
  const startMatching = useCallback(
    (list: PreviewItem[]) => {
      const gen = ++matchGen.current;
      setMatchProgress({ done: 0, total: list.length });
      let idx = 0;
      let done = 0;

      async function worker() {
        while (true) {
          if (gen !== matchGen.current) return;
          const i = idx++;
          if (i >= list.length) return;
          const it = list[i];
          let match: MatchCandidate | null = null;
          try {
            let url: string;
            if (it.source === "sp") {
              const qs = new URLSearchParams({ title: it.title });
              if (it.artist) qs.set("artist", it.artist);
              if (it.durationSeconds) {
                qs.set("duration", String(it.durationSeconds));
              }
              url = `/api/spotify/match?${qs.toString()}`;
            } else {
              const qs = new URLSearchParams({
                videoId: it.videoId,
                title: it.title,
                channel: it.channelTitle,
              });
              if (it.durationSeconds) {
                qs.set("duration", String(it.durationSeconds));
              }
              url = `/api/youtube/match?${qs.toString()}`;
            }
            const res = await fetch(url, { cache: "no-store" });
            if (res.ok) {
              const data = (await res.json()) as {
                match?: MatchCandidate | null;
              };
              match = data.match ?? null;
            }
          } catch {
            match = null;
          }
          if (gen !== matchGen.current) return;
          setMatches((prev) => {
            const n = new Map(prev);
            n.set(it.videoId, match);
            return n;
          });
          // Spotify rows were optimistically selected before matching.
          // If the match turned out to be a banned video (or no match at
          // all), drop the row from the selection so the submit count
          // stays honest.
          if (it.source === "sp") {
            const banned =
              !!match && bannedIdsRef.current.has(match.videoId);
            if (!match || banned) {
              setSelected((s) => {
                if (!s.has(it.videoId)) return s;
                const n = new Set(s);
                n.delete(it.videoId);
                return n;
              });
            }
          }
          done += 1;
          setMatchProgress({ done, total: list.length });
        }
      }

      const workers = Array.from(
        { length: Math.min(MATCH_CONCURRENCY, list.length) },
        () => worker(),
      );
      void Promise.all(workers);
    },
    [],
  );

  useEffect(() => {
    if (items && items.length > 0) startMatching(items);
  }, [items, startMatching]);

  function toggle(videoId: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(videoId)) n.delete(videoId);
      else n.add(videoId);
      return n;
    });
  }

  function selectAllEligible() {
    if (!items) return;
    const next = new Set<string>();
    for (const r of items) {
      if (r.source === "sp") {
        // Spotify rows need a match before they're playable. If we've
        // already resolved the row and it came back null, or the match
        // is banned, skip it.
        const m = matches.get(r.videoId) ?? null;
        if (!matches.has(r.videoId) || (m && !bannedIds.has(m.videoId))) {
          next.add(r.videoId);
        }
      } else if (!bannedIds.has(r.videoId) && r.available !== false) {
        next.add(r.videoId);
      }
    }
    setSelected(next);
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function toggleUseOriginal(videoId: string) {
    setKeepOriginal((s) => {
      const n = new Set(s);
      if (n.has(videoId)) n.delete(videoId);
      else n.add(videoId);
      return n;
    });
  }

  // What we'll actually send for a given preview row: the match if we have
  // one and the user hasn't overridden, otherwise the original. Spotify
  // rows return null when there's no match — their synthetic "sp:<id>"
  // videoId isn't playable on YouTube so we skip them at submit time.
  function effectiveFor(it: PreviewItem): {
    videoId: string;
    title: string;
    thumbnail: string;
  } | null {
    const m = matches.get(it.videoId) ?? null;
    if (it.source === "sp") {
      if (!m) return null;
      return { videoId: m.videoId, title: m.title, thumbnail: m.thumbnail };
    }
    if (m && matchEnabled && !keepOriginal.has(it.videoId)) {
      return { videoId: m.videoId, title: m.title, thumbnail: m.thumbnail };
    }
    return {
      videoId: it.videoId,
      title: it.title,
      thumbnail: it.thumbnail,
    };
  }

  async function submit() {
    if (!items || selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    setFlash(null);
    const picks = items
      .filter((it) => selected.has(it.videoId))
      .map((it) => effectiveFor(it))
      .filter(
        (p): p is { videoId: string; title: string; thumbnail: string } =>
          p !== null,
      );
    if (picks.length === 0) {
      setError(
        "None of the selected tracks have a playable match yet. Wait for matching to finish or tweak your selection.",
      );
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/party/${code}/bulk-add`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: picks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't import");
        return;
      }
      onImported((data as { party: PublicParty }).party);
      const count = (data as { count?: number }).count ?? picks.length;
      setFlash(
        `Party playlist set · ${count} track${count === 1 ? "" : "s"} will loop in the background.`,
      );
      setItems(null);
      setSelected(new Set());
      setMatches(new Map());
      setKeepOriginal(new Set());
      setMatchProgress({ done: 0, total: 0 });
      matchGen.current += 1;
      setRaw("");
    } catch {
      setError("Network error — try again?");
    } finally {
      setSubmitting(false);
    }
  }

  const eligibleCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((it) => {
      if (it.source === "sp") {
        const m = matches.get(it.videoId) ?? null;
        // Not yet attempted: treat as potentially eligible. Attempted
        // with a usable match that isn't banned: eligible.
        if (!matches.has(it.videoId)) return true;
        return !!m && !bannedIds.has(m.videoId);
      }
      return !bannedIds.has(it.videoId) && it.available !== false;
    }).length;
  }, [items, bannedIds, matches]);

  const unmatchedCount = useMemo(() => {
    if (!items) return 0;
    // How many Spotify rows have been attempted and came back with no
    // usable match. Surfaced in the selection summary so the host knows
    // why their count shrunk mid-matching.
    return items.filter(
      (it) => it.source === "sp" && matches.has(it.videoId) && !matches.get(it.videoId),
    ).length;
  }, [items, matches]);

  const unavailableCount = useMemo(() => {
    if (!items) return 0;
    return items.filter((it) => it.available === false).length;
  }, [items]);

  const matchCount = useMemo(() => {
    let n = 0;
    for (const v of matches.values()) if (v) n++;
    return n;
  }, [matches]);

  const matching =
    matchProgress.total > 0 && matchProgress.done < matchProgress.total;

  return (
    <div className="card p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-semibold">
          Party playlist{" "}
          <span className="font-normal text-white/50">
            · loops when the queue is empty
          </span>
        </span>
        <span className="text-white/50">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {/* Signed-in users see their saved playlists at the top so loading
              one is a single click, no URL-paste round-trip. */}
          {authUser ? (
            <div className="rounded-lg bg-white/5 p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/50">
                <span>Your saved playlists</span>
                {savedLoading ? (
                  <span className="text-white/40">Loading…</span>
                ) : null}
              </div>
              {savedError ? (
                <p className="text-xs text-red-400">{savedError}</p>
              ) : null}
              {!savedLoading && savedPlaylists.length === 0 ? (
                <p className="text-xs text-white/50">
                  You haven&apos;t saved any playlists yet. Load a YouTube
                  playlist below, pick your favorites, and hit Save.
                </p>
              ) : null}
              {savedPlaylists.length > 0 ? (
                <ul className="space-y-1">
                  {savedPlaylists.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="text-white/50">
                          {p.count} track{p.count === 1 ? "" : "s"}
                        </div>
                      </div>
                      {isAdmin ? (
                        <button
                          type="button"
                          disabled={busyPlaylistId === p.id}
                          onClick={() => loadSavedIntoParty(p.id)}
                          className="rounded bg-brand-600/80 px-2 py-0.5 text-white hover:bg-brand-500"
                          title="Load this playlist as the party's background loop"
                        >
                          {busyPlaylistId === p.id ? "…" : "Load"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busyPlaylistId === p.id}
                        onClick={() => setEditingPlaylistId(p.id)}
                        className="rounded bg-white/10 px-2 py-0.5 text-white/80 hover:bg-white/20"
                        title="Rename, reorder, or remove tracks"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busyPlaylistId === p.id}
                        onClick={() => deleteSavedPlaylist(p.id, p.name)}
                        className="rounded bg-white/10 px-2 py-0.5 text-white/70 hover:bg-red-600/60 hover:text-white"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {/* Source tabs. Switching sources clears any in-flight preview /
              match state so we don't mix rows from two providers. */}
          <div className="flex gap-1 text-xs">
            {(
              [
                { id: "youtube", label: "YouTube" },
                { id: "spotify", label: "Spotify" },
              ] as const
            ).map((s) => {
              const active = source === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (source === s.id) return;
                    setSource(s.id);
                    setRaw("");
                    setItems(null);
                    setSelected(new Set());
                    setMatches(new Map());
                    setKeepOriginal(new Set());
                    setMatchProgress({ done: 0, total: 0 });
                    setRegion(null);
                    setError(null);
                    setFlash(null);
                    matchGen.current += 1;
                  }}
                  className={
                    "rounded px-2 py-1 font-medium transition " +
                    (active
                      ? "bg-brand-600 text-white"
                      : "bg-white/5 text-white/70 hover:bg-white/10")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          <form onSubmit={loadPlaylist} className="flex gap-2">
            <input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={
                source === "spotify"
                  ? "Spotify playlist URL or ID"
                  : "YouTube playlist URL or ID"
              }
              className="input flex-1 !py-1.5 text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={loading || !raw.trim()}
              className="btn-primary !px-3 !py-1.5 text-sm"
            >
              {loading ? "Loading…" : "Load"}
            </button>
          </form>
          <p className="text-xs text-white/50">
            {source === "spotify"
              ? "Paste a public or unlisted Spotify playlist link. Tracks are matched to YouTube music videos before being queued (Spotify itself isn't playable in-browser here)."
              : "Paste a YouTube or YouTube Music playlist link. For your \u201CLiked music\u201D playlist, set it to Unlisted or Public first so the server can read it."}
          </p>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          {flash ? <p className="text-xs text-emerald-300">{flash}</p> : null}

          {items && items.length === 0 ? (
            <p className="text-xs text-white/50">
              No playable videos in that playlist.
            </p>
          ) : null}

          {items && items.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
                <span>
                  {selected.size} of {items.length} selected
                  {unavailableCount > 0 ? (
                    <span className="text-amber-300/80">
                      {" "}
                      · {unavailableCount} not available
                      {region ? ` in ${region}` : ""}
                    </span>
                  ) : null}
                  {eligibleCount < items.length - unavailableCount - unmatchedCount ? (
                    <span className="text-white/40">
                      {" "}
                      ·{" "}
                      {items.length - eligibleCount - unavailableCount - unmatchedCount} banned
                    </span>
                  ) : null}
                  {unmatchedCount > 0 ? (
                    <span className="text-amber-300/70">
                      {" "}
                      · {unmatchedCount} without a match
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllEligible}
                    className="text-white/70 hover:text-white"
                  >
                    Select all
                  </button>
                  <span className="text-white/30">·</span>
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-white/70 hover:text-white"
                  >
                    None
                  </button>
                </div>
              </div>

              {/* The upgrade toggle only affects YouTube rows — Spotify
                  rows have no playable original to fall back to. Hide it
                  on pure-Spotify lists and just show the matching
                  progress line instead. */}
              {items.some((it) => it.source !== "sp") ? (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={matchEnabled}
                    onChange={(e) => setMatchEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 accent-brand-500"
                  />
                  <span>
                    Upgrade to music videos when found
                    {matching ? (
                      <span className="text-white/40">
                        {" "}
                        · matching {matchProgress.done}/{matchProgress.total}…
                      </span>
                    ) : matchProgress.total > 0 ? (
                      <span className="text-white/40">
                        {" "}
                        · found {matchCount} music video{matchCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </span>
                </label>
              ) : matchProgress.total > 0 ? (
                <p className="text-xs text-white/60">
                  {matching
                    ? `Matching YouTube videos… ${matchProgress.done}/${matchProgress.total}`
                    : `Matched ${matchCount} of ${matchProgress.total} tracks`}
                </p>
              ) : null}

              {/* Save-as-playlist: only meaningful when signed in. */}
              {authUser ? (
                <div className="rounded-lg bg-white/5 p-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-white/50">
                    Save to your account
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Playlist name"
                      maxLength={80}
                      className="input flex-1 !py-1 text-sm"
                    />
                    <button
                      type="button"
                      disabled={saving || selected.size === 0 || !saveName.trim()}
                      onClick={saveSelectionAsPlaylist}
                      className="btn-ghost !px-3 !py-1 text-sm"
                      title="Save the selected tracks as a reusable playlist on your account"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              ) : null}

              <ul className="max-h-[50vh] space-y-2 overflow-auto">
                {items.map((r) => {
                  const isSpotify = r.source === "sp";
                  const match = matches.get(r.videoId) ?? null;
                  // For YouTube rows the row's own videoId is what we'd
                  // queue; for Spotify rows the match.videoId is. That's
                  // what we check against the banned list.
                  const effectiveVideoId = isSpotify
                    ? match?.videoId
                    : r.videoId;
                  const banned = !!effectiveVideoId && bannedIds.has(effectiveVideoId);
                  const unavailable = r.available === false;
                  // Spotify rows haven't been attempted yet? "matching".
                  // Attempted and returned null? "no match".
                  const attempted = matches.has(r.videoId);
                  const matchPending = isSpotify && !attempted;
                  const noMatch = isSpotify && attempted && !match;
                  const disabled = banned || unavailable || noMatch;
                  const checked = selected.has(r.videoId);
                  const usingMatch =
                    !!match &&
                    (isSpotify ||
                      (matchEnabled && !keepOriginal.has(r.videoId)));
                  const shown = usingMatch && match ? match : r;
                  const badge = banned
                    ? "Banned"
                    : unavailable
                      ? (r.unavailableReason ?? "Unavailable")
                      : noMatch
                        ? "No match"
                        : matchPending
                          ? "Matching…"
                          : null;
                  return (
                    <li
                      key={r.videoId}
                      className={
                        "flex items-start gap-2 rounded-md p-2 " +
                        (disabled
                          ? "bg-white/[0.03] opacity-60"
                          : "bg-white/5 hover:bg-white/10")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(r.videoId)}
                        className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-500"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shown.thumbnail}
                        alt=""
                        className="h-8 w-14 flex-shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs leading-snug break-words">
                          {/* Spotify: always show the original track title
                              up top (so the user knows what they picked);
                              YouTube: show whichever we'll queue. */}
                          {isSpotify ? r.title : shown.title}
                        </div>
                        <div className="truncate text-[11px] text-white/50">
                          {isSpotify ? r.channelTitle : shown.channelTitle}
                          {shown.duration ? ` · ${shown.duration}` : ""}
                        </div>
                        {isSpotify && match ? (
                          <div className="mt-0.5 truncate text-[11px] text-brand-300/80">
                            🎬 {match.title}
                            {match.channelTitle
                              ? ` · ${match.channelTitle}`
                              : ""}
                          </div>
                        ) : null}
                        {!isSpotify && match && matchEnabled ? (
                          <button
                            type="button"
                            onClick={() => toggleUseOriginal(r.videoId)}
                            className="mt-1 text-[11px] text-brand-300 underline-offset-2 hover:underline"
                            title={
                              usingMatch
                                ? `Original: ${r.title}`
                                : `Music video: ${match.title}`
                            }
                          >
                            {usingMatch
                              ? "🎬 Music video · use original"
                              : "↺ Using original · use music video"}
                          </button>
                        ) : null}
                      </div>
                      {badge ? (
                        <span
                          className={
                            "flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] " +
                            (unavailable
                              ? "bg-amber-500/20 text-amber-200"
                              : noMatch
                                ? "bg-amber-500/20 text-amber-200"
                                : matchPending
                                  ? "bg-white/10 text-white/60"
                                  : "bg-white/10 text-white/70")
                          }
                          title={
                            unavailable
                              ? `This video isn't playable in ${region ?? "your region"}.`
                              : noMatch
                                ? "Couldn't find a confident YouTube match for this track — it can't be queued."
                                : undefined
                          }
                        >
                          {unavailable ? "🌐 " : ""}
                          {badge}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={submitting || selected.size === 0}
                  onClick={submit}
                  className="btn-primary !px-3 !py-1.5 text-sm"
                >
                  {submitting
                    ? "Saving…"
                    : `Set as party playlist · ${selected.size} track${selected.size === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {editingPlaylistId ? (
        <EditPlaylistModal
          playlistId={editingPlaylistId}
          onClose={() => setEditingPlaylistId(null)}
          onSaved={(updated) => {
            // Patch the summary in place so name/count update without a
            // full re-fetch (keeps order stable). loadSavedPlaylists would
            // also work but this avoids a flash.
            setSavedPlaylists((ps) =>
              ps.map((p) =>
                p.id === updated.id
                  ? {
                      ...p,
                      name: updated.name,
                      count: updated.count,
                      updatedAt: Date.now(),
                    }
                  : p,
              ),
            );
          }}
        />
      ) : null}
    </div>
  );
}
