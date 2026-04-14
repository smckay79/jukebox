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

export interface Party {
  code: string; // public join code
  adminKey: string; // secret, only creator holds
  name: string;
  createdAt: number;
  queue: Song[];
  nowPlaying: Song | null;
  history: Song[]; // played songs
}

export interface PublicParty {
  code: string;
  name: string;
  createdAt: number;
  queue: Song[];
  nowPlaying: Song | null;
}
