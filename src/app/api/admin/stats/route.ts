import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllParties } from "@/lib/store";
import { countAllUsers } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [parties, userCount] = await Promise.all([
    getAllParties(),
    countAllUsers(),
  ]);

  const active = parties.filter((p) => !p.endedAt);
  const ended = parties.filter((p) => !!p.endedAt);

  let totalSongsPlayed = 0;
  let totalSecondsPlayed = 0;
  const songCounts = new Map<
    string,
    { videoId: string; title: string; thumbnail: string; count: number }
  >();

  for (const p of parties) {
    for (const song of p.history) {
      totalSongsPlayed++;
      if (song.playedSeconds) totalSecondsPlayed += song.playedSeconds;

      const existing = songCounts.get(song.videoId);
      if (existing) {
        existing.count++;
      } else {
        songCounts.set(song.videoId, {
          videoId: song.videoId,
          title: song.title,
          thumbnail: song.thumbnail,
          count: 1,
        });
      }
    }
  }

  const topSongs = Array.from(songCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  return NextResponse.json({
    totalUsers: userCount,
    totalParties: parties.length,
    activeParties: active.length,
    endedParties: ended.length,
    totalSongsPlayed,
    totalSecondsPlayed,
    totalHoursPlayed: Math.round((totalSecondsPlayed / 3600) * 10) / 10,
    topSongs,
  });
}
