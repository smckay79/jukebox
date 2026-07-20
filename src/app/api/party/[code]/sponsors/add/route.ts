import { NextResponse } from "next/server";
import { verifyAdmin, addSponsor, toPublicParty, getHostTier } from "@/lib/store";

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

  let body: { imageUrl?: string; title?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid-request" },
      { status: 400 },
    );
  }

  if (!body.imageUrl) {
    console.error("Sponsor add: missing imageUrl");
    return NextResponse.json(
      { error: "missing-image" },
      { status: 400 },
    );
  }

  console.log("Sponsor add: imageUrl length:", body.imageUrl.length, "title:", body.title);
  const result = await addSponsor(params.code, {
    imageUrl: body.imageUrl,
    title: body.title,
  });

  if (!result.ok) {
    console.error("Sponsor add failed:", result.error);
    return NextResponse.json(
      { error: result.error },
      { status: 400 },
    );
  }

  const tier = await getHostTier(result.party);
  return NextResponse.json({ ok: true, party: toPublicParty(result.party, tier) });
}
