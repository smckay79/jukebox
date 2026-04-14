import { NextResponse } from "next/server";
import { getParty, removeSong, skipCurrent, toPublicParty, verifyAdmin } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST body: { action: "skip" } | { action: "remove", songId: string }
// Admin key is sent via the `x-admin-key` header.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const party = getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const key = req.headers.get("x-admin-key");
  if (!verifyAdmin(params.code, key)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string; songId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "skip") {
    skipCurrent(params.code);
    return NextResponse.json({ party: toPublicParty(party) });
  }
  if (body.action === "remove") {
    const songId = (body.songId ?? "").toString();
    if (!songId) {
      return NextResponse.json({ error: "Missing songId" }, { status: 400 });
    }
    const res = removeSong(params.code, songId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }
    return NextResponse.json({ party: toPublicParty(party) });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
