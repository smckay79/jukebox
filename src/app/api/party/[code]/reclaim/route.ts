import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getParty } from "@/lib/store";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "not-signed-in" }, { status: 401 });
  }

  const party = await getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (!party.hostUserId || party.hostUserId !== user.id) {
    return NextResponse.json({ error: "not-owner" }, { status: 403 });
  }

  return NextResponse.json({ adminKey: party.adminKey, adminPin: party.adminPin });
}
