import { NextResponse } from "next/server";
import { getPartyHistory, verifyAdmin } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: the played-song history for this party. Returned newest
// first so the UI can render without further sorting. Guests never see
// history — keeping it admin-gated avoids leaking the full listening log
// to party crashers and matches how we treat banned / stats.
export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const history = await getPartyHistory(params.code);
  if (history === null) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  return NextResponse.json({ history });
}
