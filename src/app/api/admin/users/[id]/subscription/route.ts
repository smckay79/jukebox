import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getSubscriptionInfo } from "@/lib/subscription";
import { getUser, updateUserSubscription } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const target = await getUser(params.id);
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (body.action === "setPro") {
    const updated = await updateUserSubscription(params.id, {
      subscriptionOverride: "pro",
      subscriptionSource: "admin",
    });
    return NextResponse.json({
      user: updated,
      subscription: updated ? getSubscriptionInfo(updated) : null,
    });
  }

  if (body.action === "revoke") {
    const updated = await updateUserSubscription(params.id, {
      subscriptionOverride: "none",
      subscriptionSource: "admin",
    });
    return NextResponse.json({
      user: updated,
      subscription: updated ? getSubscriptionInfo(updated) : null,
    });
  }

  if (body.action === "clear") {
    const updated = await updateUserSubscription(params.id, {
      subscriptionOverride: undefined,
      subscriptionSource: undefined,
    });
    return NextResponse.json({
      user: updated,
      subscription: updated ? getSubscriptionInfo(updated) : null,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
