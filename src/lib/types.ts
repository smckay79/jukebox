export interface Song {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  addedBy: string; // display name
  addedByUserId: string;
  addedAt: number;
  votes: string[]; // userIds that upvoted
  // "user" = someone added this through search/url/vote (default, omitted
  // on legacy rows). "playlist" = promoted from the party's background
  // playlist; these are interruptible and never written to history.
  source?: "user" | "playlist" | "bumper";
  // Wall-clock epoch ms at which this song became `nowPlaying`. Set when
  // promoted; used on skip/ended to compute `playedSeconds`. Legacy rows
  // (played before this field existed) leave it undefined.
  startedAt?: number;
  // How long the song actually played for, in seconds. Only populated on
  // the history entry — nowPlaying doesn't carry this. Approximate (the
  // player end signal is "song ended", not "song played exactly N sec").
  playedSeconds?: number;
}

export interface BannedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  bannedAt: number;
}

// Era / genre pair drives a procedurally-generated wallpaper. `customImage`
// (a data URL, resized client-side) takes precedence over the procedural one
// when set, so hosts can drop in a party photo.
export interface PartyTheme {
  era?: string;
  genre?: string;
  seed?: number;
  customImage?: string;
}

// Lightweight item stored on the party's background playlist. Kept thin
// (no votes/addedBy/id) because these loop and are promoted into nowPlaying
// only when the user queue is empty.
export interface PlaylistTrack {
  videoId: string;
  title: string;
  thumbnail: string;
}

export interface BumperVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  // "random" (default) plays with ~30% chance between any songs.
  // "match" plays before a song whose title contains `triggerMatch`.
  triggerType?: "random" | "match";
  // Case-insensitive substring matched against song titles. Only used
  // when triggerType is "match" — e.g. "Drake" triggers before any
  // song with "Drake" in the title.
  triggerMatch?: string;
}

export interface PartyPlaylist {
  items: PlaylistTrack[];
  cursor: number; // next track to promote when queue is empty
  setAt: number;
}

export interface Party {
  code: string; // public join code
  adminKey: string; // secret, only creator holds
  adminPin: string; // short numeric PIN for TV/Android admin access
  name: string;
  createdAt: number;
  hostUserId?: string;
  queue: Song[];
  nowPlaying: Song | null;
  history: Song[]; // played songs
  banned: BannedVideo[];
  theme?: PartyTheme;
  // Optional ticker text shown scrolling across the bottom of the screen
  // on the desktop/TV view. Empty string or undefined = no ticker.
  marquee?: string;
  // Background playlist imported by the host. Loops in the background
  // whenever the user queue is empty; user-added songs interrupt and take
  // priority. Absent = no background playlist set.
  playlist?: PartyPlaylist;
  // Short interstitial videos that play randomly between songs.
  bumpers?: BumperVideo[];
  // ISO 3166-1 alpha-2 country code. When set, search results and playlist
  // imports are filtered to videos playable in this country — overriding
  // the auto-detected region from the request. Absent = use auto-detect.
  country?: string;
  // Set when the host ends the party. Once set, the client swaps to the
  // "Party ended" recap view, the queue/nowPlaying are cleared, and new
  // song adds are rejected. The party record itself is kept around until
  // its normal Redis TTL expires (7 days) so guests who re-open the link
  // still see the recap.
  endedAt?: number;
  // Best-effort flag so we don't double-send the recap email if a
  // retry/reload hits the end endpoint twice. The email send itself is
  // fire-and-forget; this just gates the second attempt.
  recapEmailSent?: boolean;
  // Email the recap was delivered to (or attempted to be delivered
  // to). Lets a post-reload recap view show "Emailed to x@y.com" even
  // though we don't re-send.
  recapEmailTo?: string;
  // Persisted copy of what we saved for the host on end. Lets a reload
  // of the recap view show the same "Saved N tracks…" status.
  recapSavedPlaylist?: {
    id: string;
    name: string;
    count: number;
  };
}

export interface PublicParty {
  code: string;
  name: string;
  createdAt: number;
  queue: Song[];
  nowPlaying: Song | null;
  banned: BannedVideo[];
  theme?: PartyTheme;
  marquee?: string;
  // Summary for the UI — just enough to show a badge ("N tracks in
  // background"), without shipping every item to every client on each SSE
  // frame.
  playlist?: { count: number; setAt: number };
  bumpers?: { count: number };
  // See Party.country — exposed so the admin settings menu can show the
  // current selection, and so the guest client can attach it to search.
  country?: string;
  // When set, the party has been ended by the host — the client switches
  // to a recap view.
  endedAt?: number;
  // Party time limit info for free-tier hosts. Absent = unlimited.
  timeLimit?: {
    limitMs: number;
    expiresAt: number;
    expired: boolean;
  };
}

// Payload returned by POST /api/party/[code]/end and rendered on the
// "Party ended" view. Aggregates the party's history into the three
// things the host actually wants to see: what played (with durations),
// who requested what, and how long things ran for.
export interface PartyRecap {
  code: string;
  name: string;
  startedAt: number;
  endedAt: number;
  totalPlayed: number; // number of history entries
  totalSeconds: number; // sum of playedSeconds (skips unknown durations)
  // Up to N most-requested users, sorted by count desc. `userId` is the
  // anonymous client id (or the signed-in user's sub); `name` is the
  // display name last seen for that user.
  topRequesters: {
    userId: string;
    name: string;
    count: number;
  }[];
  // Full played-song list, in chronological order (oldest first).
  history: {
    videoId: string;
    title: string;
    thumbnail: string;
    addedBy: string;
    playedAt: number;
    playedSeconds?: number;
  }[];
  // Present when a recap email was requested and the server attempted
  // to send it. `ok: false` just means delivery failed or email isn't
  // configured — the recap payload itself is still returned.
  emailStatus?:
    | { ok: true; to: string }
    | { ok: false; reason: string };
  // Present when the host was signed in and we wrote a SavedPlaylist
  // copy of the history. Same pattern as emailStatus.
  savedPlaylist?:
    | { ok: true; id: string; name: string; count: number }
    | { ok: false; reason: string };
}

// A signed-in user (via Google). `id` is the Google `sub` claim — stable
// across sessions, the only field we treat as the primary key.
export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  createdAt: number;
  lastLoginAt: number;
  // Epoch ms when current paid period ends. Absent = never paid.
  subscriptionPaidUntil?: number;
  // Admin manual override. "pro" grants unlimited access regardless of
  // payment; "none" revokes even a valid paid subscription (abuse).
  subscriptionOverride?: "pro" | "none";
  subscriptionSource?: "admin" | "stripe";
}

// Same shape exposed to the client. Keeps parity explicit so a future
// addition of server-only fields on User doesn't silently leak.
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  subscription: SubscriptionInfo;
}

export type SubscriptionTier = "trial" | "pro" | "free";

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  trialEndsAt: number;
  paidUntil: number | null;
  daysLeft: number;
  isOwner: boolean;
}

// A user-owned playlist they can reuse across parties. Items match the
// shape of PlaylistTrack so we can drop them straight into setPartyPlaylist.
export interface SavedPlaylist {
  id: string;
  ownerId: string;
  name: string;
  items: PlaylistTrack[];
  createdAt: number;
  updatedAt: number;
}

// Summary shape for listings — omits the full item array so a "your
// playlists" sidebar doesn't pay the bandwidth of every track.
export interface SavedPlaylistSummary {
  id: string;
  name: string;
  count: number;
  updatedAt: number;
}
