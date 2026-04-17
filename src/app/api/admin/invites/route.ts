import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createInvite, listAllInvites, revokeInvite } from "@/lib/invites";
import { sendInviteEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const invites = await listAllInvites();
  return NextResponse.json({ invites });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    action?: string;
    code?: string;
    maxUses?: number;
    grantDays?: number;
    recipientEmail?: string;
    message?: string;
    expiresInDays?: number;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "revoke" && body.code) {
    const ok = await revokeInvite(body.code);
    return NextResponse.json({ ok });
  }

  const invite = await createInvite({
    createdBy: admin.id,
    createdByName: admin.name,
    type: "admin",
    maxUses: body.maxUses ?? 1,
    grantDays: body.grantDays ?? 90,
    recipientEmail: body.recipientEmail,
    message: body.message,
    expiresAt: body.expiresInDays
      ? Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000
      : undefined,
  });

  let emailResult = null;
  if (body.recipientEmail) {
    emailResult = await sendInviteEmail(
      body.recipientEmail,
      invite,
      getAppUrl(),
    );
  }

  return NextResponse.json({ invite, emailResult });
}
