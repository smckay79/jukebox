import { NextResponse } from "next/server";
import { verifyAdmin, clearSponsors, toPublicParty, getHostTier } from "@/lib/store";

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

  const result = await clearSponsors(params.code);

  if (!result.ok) {
    console.error("Clear sponsors failed:", result.error);
    return NextResponse.json(
      { error: result.error },
      { status: 400 },
    );
  }

  const tier = await getHostTier(result.party);
  return NextResponse.json({ ok: true, party: toPublicParty(result.party, tier) });
}
