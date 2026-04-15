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
  source?: "user" | "playlist";
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

export interface PartyPlaylist {
  items: PlaylistTrack[];
  cursor: number; // next track to promote when queue is empty
  setAt: number;
}

export interface Party {
  code: string; // public join code
  adminKey: string; // secret, only creator holds
  name: string;
  createdAt: number;
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
  // ISO 3166-1 alpha-2 country code. When set, search results and playlist
  // imports are filtered to videos playable in this country — overriding
  // the auto-detected region from the request. Absent = use auto-detect.
  country?: string;
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
  // See Party.country — exposed so the admin settings menu can show the
  // current selection, and so the guest client can attach it to search.
  country?: string;
}
