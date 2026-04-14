import { NextResponse } from "next/server";
import { matchMusicVideo } from "@/lib/match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-item matching for the playlist importer. The client fires one of
// these per preview row (with a small concurrency cap) so we don't block
// the preview load on N serial innertube searches — the UI can update
// progressively as matches come in.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const videoId = (url.searchParams.get("videoId") ?? "").trim();
  const title = (url.searchParams.get("title") ?? "").trim();
  const channelTitle = (url.searchParams.get("channel") ?? "").trim();
  const durationStr = url.searchParams.get("duration");
  const durationSeconds = durationStr ? parseInt(durationStr, 10) : undefined;

  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: "Bad videoId" }, { status: 400 });
  }
  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    const match = await matchMusicVideo({
      videoId,
      title: title.slice(0, 200),
      channelTitle: channelTitle.slice(0, 120),
      durationSeconds:
        durationSeconds && Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : undefined,
    });
    return NextResponse.json({ match });
  } catch (err) {
    console.error("[match] failed", err);
    return NextResponse.json({ match: null });
  }
}
