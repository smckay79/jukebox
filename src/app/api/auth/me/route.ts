import { NextResponse } from "next/server";
import { getSessionUser, toPublicUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns the signed-in user (or null). Used by the header UserMenu to
// decide whether to show "Sign in" or the avatar dropdown, and to pick
// up session state after a login redirect.
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user: user ? toPublicUser(user) : null });
}
