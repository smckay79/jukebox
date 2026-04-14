import { NextResponse } from "next/server";
import { getParty, toPublicParty, voteSong } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const party = getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }

  let body: { songId?: string; userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const songId = (body.songId ?? "").toString();
  const userId = (body.userId ?? "").toString().slice(0, 64);
  if (!songId || !userId) {
    return NextResponse.json(
      { error: "songId and userId are required" },
      { status: 400 },
    );
  }
  const result = voteSong(params.code, songId, userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    votes: result.votes,
    voted: result.voted,
    party: toPublicParty(party),
  });
}
