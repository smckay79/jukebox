import { NextResponse } from "next/server";
import { matchFromTitleArtist } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Find the best YouTube music-video match for a Spotify track. Input
// comes from the client's preview row (title + primary artist +
// duration), output is the same MatchOutput shape the YouTube importer
// uses, so the ImportPlaylist UI can render either provider's match
// through the same components.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get("title") ?? "").trim();
  const artist = (url.searchParams.get("artist") ?? "").trim();
  const durationStr = url.searchParams.get("duration");
  const durationSeconds = durationStr ? parseInt(durationStr, 10) : undefined;

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const match = await matchFromTitleArtist({
      title: title.slice(0, 200),
      artist: artist ? artist.slice(0, 120) : undefined,
      durationSeconds:
        durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : undefined,
    });
    return NextResponse.json({ match });
  } catch (err) {
    console.error("[spotify/match] failed", err);
    return NextResponse.json({ match: null });
  }
}
