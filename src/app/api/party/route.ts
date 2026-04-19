import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createParty } from "@/lib/store";
import type { PartyTheme } from "@/lib/types";

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

  let body: { name?: string; theme?: PartyTheme } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  const name = (body.name ?? "").toString().slice(0, 60);
  const theme = body.theme ?? undefined;
  const party = await createParty(name, user.id, theme);
  return NextResponse.json({
    code: party.code,
    adminKey: party.adminKey,
    adminPin: party.adminPin,
    name: party.name,
  });
}
