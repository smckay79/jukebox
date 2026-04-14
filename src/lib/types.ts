export interface Song {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  addedBy: string; // display name
  addedByUserId: string;
  addedAt: number;
  votes: string[]; // userIds that upvoted
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
}
