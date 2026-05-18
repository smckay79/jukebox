import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserPartyHistory } from "@/lib/store";
import { getSubscriptionInfo } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "sign-in-required" },
      { status: 401 },
    );
  }

  const { tier } = getSubscriptionInfo(user);
  const isPaid = tier === "pro" || tier === "trial";

  if (!isPaid) {
    return NextResponse.json(
      { error: "paid-tier-required" },
      { status: 403 },
    );
  }

  const history = await getUserPartyHistory(user.id);
  return NextResponse.json({ history });
}
