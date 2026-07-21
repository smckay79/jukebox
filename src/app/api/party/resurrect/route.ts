import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserPartyHistory, resurrectParty } from "@/lib/store";
import { getSubscriptionInfo } from "@/lib/subscription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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

  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid-request" },
      { status: 400 },
    );
  }

  if (!body.code) {
    return NextResponse.json(
      { error: "missing-code" },
      { status: 400 },
    );
  }

  const history = await getUserPartyHistory(user.id);
  const snapshot = history.find((p) => p.code === body.code);

  if (!snapshot) {
    return NextResponse.json(
      { error: "party-not-found" },
      { status: 404 },
    );
  }

  // Rebuild the party from the snapshot: same code (identical QR), restored
  // theme / marquee / country / bumpers / sponsors, and a background playlist
  // seeded with the original loop plus every song added that night.
  const newParty = await resurrectParty(user.id, snapshot);

  return NextResponse.json({
    code: newParty.code,
    adminKey: newParty.adminKey,
    adminPin: newParty.adminPin,
    name: newParty.name,
  });
}
