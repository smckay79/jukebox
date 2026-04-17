import { NextResponse } from "next/server";
import { downvoteNowPlaying, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: { userId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const userId = (body.userId ?? "").toString().slice(0, 64);
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 },
    );
  }
  const result = await downvoteNowPlaying(params.code, userId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({
    downvotes: result.downvotes,
    skipped: result.skipped,
    party: toPublicParty(result.party),
  });
}
