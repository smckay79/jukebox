import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllParties } from "@/lib/store";
import { countViewers } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parties = await getAllParties();

  const summaries = await Promise.all(
    parties.map(async (p) => {
      const viewers = p.endedAt ? 0 : await countViewers(p.code);
      let totalSeconds = 0;
      for (const s of p.history) {
        if (s.playedSeconds) totalSeconds += s.playedSeconds;
      }
      return {
        code: p.code,
        name: p.name,
        createdAt: p.createdAt,
        endedAt: p.endedAt,
        hostUserId: p.hostUserId ?? null,
        queueSize: p.queue.length,
        nowPlaying: p.nowPlaying?.title ?? null,
        historyCount: p.history.length,
        totalSeconds,
        viewers,
      };
    }),
  );

  summaries.sort((a, b) => b.createdAt - a.createdAt);

  return NextResponse.json({ parties: summaries });
}
