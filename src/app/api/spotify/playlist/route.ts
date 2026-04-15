import { NextResponse } from "next/server";
import {
  fetchSpotifyPlaylist,
  isSpotifyConfigured,
  parseSpotifyPlaylistId,
} from "@/lib/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preview a Spotify playlist so the host can pick which tracks to
// import. Spotify tracks aren't directly playable in Jukebox (the
// player is a YouTube IFrame), so each row needs a YouTube match
// before it can be submitted. The match step is client-driven via
// /api/spotify/match — same progressive-match pattern as the YouTube
// import.
export async function GET(req: Request) {
  if (!isSpotifyConfigured()) {
    return NextResponse.json(
      { error: "Spotify import isn't configured on the server." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get("id") ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Missing playlist" }, { status: 400 });
  }
  const playlistId = parseSpotifyPlaylistId(raw);
  if (!playlistId) {
    return NextResponse.json(
      { error: "Couldn't read that as a Spotify playlist URL or ID" },
      { status: 400 },
    );
  }

  const result = await fetchSpotifyPlaylist(playlistId);
  if ("error" in result) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  return NextResponse.json({
    playlistId: result.playlistId,
    name: result.name,
    tracks: result.tracks,
  });
}
