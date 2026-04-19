import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getWaitlist } from "@/lib/waitlist";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const entries = await getWaitlist();
  return NextResponse.json({ entries });
}
