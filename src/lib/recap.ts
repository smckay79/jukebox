import type { Party, PartyRecap } from "./types";

// Number of top requesters to show. 5 is what the product spec asks for;
// exported so tests / UI can pin to the same constant.
export const TOP_REQUESTERS = 5;

// Turn a Party record into a recap payload. Aggregates history into
// per-user counts and totals. Callers decorate the result with
// emailStatus / savedPlaylist before returning it to the client.
export function buildRecap(party: Party): PartyRecap {
  const now = party.endedAt ?? Date.now();

  // Sum up total seconds — skipping entries without a playedSeconds
  // (i.e. legacy history rows from before duration tracking existed).
  let totalSeconds = 0;
  for (const s of party.history) {
    if (typeof s.playedSeconds === "number") {
      totalSeconds += s.playedSeconds;
    }
  }

  // Tally adds per requester. Skip the synthetic "__playlist" user — it
  // isn't a real person, just the background-loop pseudo-id — though
  // playlist tracks shouldn't be in history anyway.
  const counts = new Map<string, { name: string; count: number }>();
  for (const s of party.history) {
    if (!s.addedByUserId || s.addedByUserId === "__playlist") continue;
    const cur = counts.get(s.addedByUserId);
    if (cur) {
      cur.count += 1;
      // Prefer the most recent non-empty display name — users might have
      // entered a better nickname after their first add.
      if (s.addedBy) cur.name = s.addedBy;
    } else {
      counts.set(s.addedByUserId, {
        name: s.addedBy || "Anonymous",
        count: 1,
      });
    }
  }
  const topRequesters = Array.from(counts.entries())
    .map(([userId, v]) => ({ userId, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_REQUESTERS);

  const history = party.history.map((s) => ({
    videoId: s.videoId,
    title: s.title,
    thumbnail: s.thumbnail,
    addedBy: s.addedBy || "Anonymous",
    playedAt: s.startedAt ?? s.addedAt,
    playedSeconds: s.playedSeconds,
  }));

  return {
    code: party.code,
    name: party.name,
    startedAt: party.createdAt,
    endedAt: now,
    totalPlayed: party.history.length,
    totalSeconds,
    topRequesters,
    history,
  };
}

// Format seconds as a friendly "Xh Ym" / "Ym Zs" / "Zs" string for use
// in the recap UI and email. Values below 1s round up so a 0.4s entry
// doesn't vanish into "0s".
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
