import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendAdminNotification } from "@/lib/email";

function esc(v: string) {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
import { getSubscriptionInfo } from "@/lib/subscription";
import {
  canUserCreateInvite,
  createInvite,
  getInvite,
  listUserInvites,
  redeemInvite,
  MAX_INVITES_PER_USER,
} from "@/lib/invites";
import { updateUserStripeFields } from "@/lib/users";
import { sendInviteEmail } from "@/lib/email";
import { getAppUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const invites = await listUserInvites(user.id);
  const referralInvites = invites.filter((i) => i.type === "referral" && !i.revokedAt);
  const canCreate = await canUserCreateInvite(user.id);
  return NextResponse.json({
    invites: referralInvites,
    canCreate,
    maxInvites: MAX_INVITES_PER_USER,
  });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: {
    action?: string;
    code?: string;
    recipientEmail?: string;
    message?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "redeem" && body.code) {
    const result = await redeemInvite(body.code, user.id, user.email);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    const grantMs = result.grantDays * 24 * 60 * 60 * 1000;
    const currentPaidUntil = user.subscriptionPaidUntil ?? 0;
    const base = Math.max(currentPaidUntil, Date.now());
    await updateUserStripeFields(user.id, {
      subscriptionPaidUntil: base + grantMs,
      subscriptionSource: "stripe",
    });
    sendAdminNotification(
      "Invite Redeemed",
      `<p><strong>${esc(user.name)}</strong> (${esc(user.email)}) redeemed invite code <strong>${esc(body.code)}</strong>.</p>` +
      `<p>Granted ${result.grantDays} days of Pro. Invited by ${esc(result.inviterName)}.</p>`,
    ).catch(() => {});
    return NextResponse.json({
      ok: true,
      grantDays: result.grantDays,
      inviterName: result.inviterName,
    });
  }

  if (body.action === "create") {
    const info = getSubscriptionInfo(user);
    if (info.tier !== "pro" && info.tier !== "trial") {
      return NextResponse.json(
        { error: "Only Pro users can create invites" },
        { status: 403 },
      );
    }
    const canCreate = await canUserCreateInvite(user.id);
    if (!canCreate) {
      return NextResponse.json(
        { error: `You've used all ${MAX_INVITES_PER_USER} invites` },
        { status: 400 },
      );
    }

    const invite = await createInvite({
      createdBy: user.id,
      createdByName: user.name,
      type: "referral",
      maxUses: 1,
      grantDays: 90,
      recipientEmail: body.recipientEmail,
      message: body.message,
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

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
