import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body */
  }
  const name = (body.name ?? "").toString().slice(0, 60);
  const user = await getSessionUser();
  const party = await createParty(name, user?.id);
  return NextResponse.json({
    code: party.code,
    adminKey: party.adminKey,
    adminPin: party.adminPin,
    name: party.name,
  });
}
