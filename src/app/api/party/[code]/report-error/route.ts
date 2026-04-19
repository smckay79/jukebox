import { NextResponse } from "next/server";
import { banVideo, songEnded, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by the player when YouTube reports an error (region-blocked,
// deleted, embedding disabled, etc.). Skips the song and bans the video
// so it can't be re-queued.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: { videoId?: string; errorCode?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const videoId = (body.videoId ?? "").toString();
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const errorCode = Number(body.errorCode) || 0;
  const reasons: Record<number, string> = {
    2: "invalid video ID",
    5: "HTML5 player error",
    100: "video not found or private",
    101: "embedding disabled",
    150: "embedding disabled",
  };
  const reason = reasons[errorCode] ?? `playback error ${errorCode}`;

  // Skip the song first so the party advances immediately
  const skipResult = await songEnded(params.code, videoId);

  // Ban the video so it can't be re-added
  await banVideo(params.code, {
    videoId,
    title: `[Auto-banned: ${reason}]`,
    thumbnail: `https://i.ytimg.com/vi/${videoId}/default.jpg`,
  });

  if (!skipResult.ok) {
    return NextResponse.json({ error: skipResult.error }, { status: 404 });
  }
  return NextResponse.json({
    party: toPublicParty(skipResult.party),
    banned: true,
    reason,
  });
}
