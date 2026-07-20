import { NextResponse } from "next/server";
import { verifyAdmin, removeSponsor, toPublicParty, getHostTier } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const adminKey = req.headers.get("x-admin-key");
  const isAdmin = await verifyAdmin(params.code, adminKey);
  if (!isAdmin) {
    return NextResponse.json(
      { error: "not-authorized" },
      { status: 403 },
    );
  }

  let body: { sponsorId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid-request" },
      { status: 400 },
    );
  }

  if (!body.sponsorId) {
    return NextResponse.json(
      { error: "missing-sponsor-id" },
      { status: 400 },
    );
  }

  const result = await removeSponsor(params.code, body.sponsorId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 },
    );
  }

  const tier = await getHostTier(params.code);
  return NextResponse.json({ ok: true, party: toPublicParty(result.party, tier) });
}
