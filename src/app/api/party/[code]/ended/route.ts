import { NextResponse } from "next/server";
import { getParty, songEnded, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by a viewer's player when the currently-playing song finishes.
// Idempotent: if the current song has already advanced, this is a no-op.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const party = getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  let body: { videoId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const videoId = (body.videoId ?? "").toString();
  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }
  songEnded(params.code, videoId);
  return NextResponse.json({ party: toPublicParty(party) });
}
