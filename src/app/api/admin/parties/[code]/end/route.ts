import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { endParty, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await endParty(params.code);
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  return NextResponse.json({
    party: toPublicParty(res.party),
    alreadyEnded: res.alreadyEnded,
  });
}
