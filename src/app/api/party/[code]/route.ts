import { NextResponse } from "next/server";
import { getHostTier, getParty, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const party = await getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  const tier = await getHostTier(party);
  return NextResponse.json(toPublicParty(party, tier));
}
