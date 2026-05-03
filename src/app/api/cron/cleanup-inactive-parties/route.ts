import { NextResponse } from "next/server";
import { runPartyCleanup } from "@/lib/cleanup-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron job to close parties that have been inactive for 6+ hours
// Can be called by: Vercel Cron, external scheduler, or manual invocation
export async function GET(req: Request) {
  // Basic auth: check for a cron secret to prevent unauthorized calls
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runPartyCleanup();

  return NextResponse.json(result);
