import { NextResponse } from "next/server";
import { getInvite } from "@/lib/invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
) {
  const invite = await getInvite(params.code);
  if (!invite || invite.revokedAt) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const expired = invite.expiresAt ? Date.now() > invite.expiresAt : false;
  const exhausted =
    invite.maxUses !== -1 && invite.uses >= invite.maxUses;

  return NextResponse.json({
    code: invite.code,
    inviterName: invite.createdByName,
    message: invite.message,
    grantDays: invite.grantDays,
    valid: !expired && !exhausted,
    expired,
    exhausted,
  });
}
