import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { clearSponsorLogo, getSponsorLogo, setSponsorLogo } from "@/lib/global-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const logo = await getSponsorLogo();
  return NextResponse.json({ logo });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const { logo } = body as { logo?: string };
  if (!logo || typeof logo !== "string" || !logo.startsWith("data:image/")) {
    return NextResponse.json({ error: "Invalid image data" }, { status: 400 });
  }
  if (logo.length > 700_000) {
    return NextResponse.json({ error: "Image too large (max ~500 KB)" }, { status: 400 });
  }
  await setSponsorLogo(logo);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await clearSponsorLogo();
  return NextResponse.json({ ok: true });
}
