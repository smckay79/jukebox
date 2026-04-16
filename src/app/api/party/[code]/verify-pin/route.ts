import { NextResponse } from "next/server";
import { verifyPin } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: { pin?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin = (body.pin ?? "").toString().trim();
  if (!pin) {
    return NextResponse.json({ error: "Missing pin" }, { status: 400 });
  }

  const adminKey = await verifyPin(params.code, pin);
  if (!adminKey) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });
  }

  return NextResponse.json({ adminKey });
}
