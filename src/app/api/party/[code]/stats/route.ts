import { NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/store";
import { countViewers, getActivity, getIpBans } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Host-only telemetry read endpoint. Returns:
//   - viewers: count of live SSE subscribers in the last 30s
//   - activity: recent add log (newest first, capped at 200)
//   - ipBans: currently-muted IPs with their expiry
// All three are short-lived / bounded, so one request is cheap enough to
// poll from the admin UI without a streaming setup.
export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [viewers, activity, ipBans] = await Promise.all([
    countViewers(params.code),
    getActivity(params.code),
    getIpBans(params.code),
  ]);
  return NextResponse.json({ viewers, activity, ipBans });
}
