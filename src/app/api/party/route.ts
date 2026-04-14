import { NextResponse } from "next/server";
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
  const party = await createParty(name);
  return NextResponse.json({
    code: party.code,
    adminKey: party.adminKey,
    name: party.name,
  });
}
