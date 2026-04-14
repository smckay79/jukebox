import { NextResponse } from "next/server";
import { removeSong, skipCurrent, toPublicParty, verifyAdmin } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST body: { action: "skip" } | { action: "remove", songId: string }
// Admin key is sent via the `x-admin-key` header.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string; songId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "skip") {
    const res = await skipCurrent(params.code);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 404 });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }
  if (body.action === "remove") {
    const songId = (body.songId ?? "").toString();
    if (!songId) {
      return NextResponse.json({ error: "Missing songId" }, { status: 400 });
    }
    const res = await removeSong(params.code, songId);
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
