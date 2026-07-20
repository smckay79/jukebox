import { NextResponse } from "next/server";
import { verifyAdmin, setSponsorLabel, toPublicParty, getHostTier } from "@/lib/store";

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

  let body: { text?: string; color?: string; brightness?: number } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid-request" },
      { status: 400 },
    );
  }

  const result = await setSponsorLabel(params.code, {
    text: body.text,
    color: body.color,
    brightness: body.brightness,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 },
    );
  }

  const tier = await getHostTier(result.party);
  return NextResponse.json({ ok: true, party: toPublicParty(result.party, tier) });
}
