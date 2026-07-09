import { NextResponse } from "next/server";
import { getSponsorLogo } from "@/lib/global-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const logo = await getSponsorLogo();
  return NextResponse.json({ logo });
}
