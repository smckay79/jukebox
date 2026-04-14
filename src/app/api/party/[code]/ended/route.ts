import { NextResponse } from "next/server";
import { songEnded, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called by a viewer's player when the currently-playing song finishes.
// Idempotent: if the current song has already advanced, this is a no-op.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
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
  const result = await songEnded(params.code, videoId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ party: toPublicParty(result.party) });
}
