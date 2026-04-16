import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { claimParty, toPublicParty, verifyAdmin } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const adminKey = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, adminKey))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to extend your party" },
      { status: 401 },
    );
  }

  const res = await claimParty(params.code, user.id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }

  return NextResponse.json({ party: toPublicParty(res.party) });
}
