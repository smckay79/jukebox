import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/store";
import { addSponsor } from "@/lib/store";

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
    return NextResponse.json(
      { error: "missing-image" },
      { status: 400 },
    );
  }

  const result = await addSponsor(params.code, {
    imageUrl: body.imageUrl,
    title: body.title,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, party: result.party });
}
