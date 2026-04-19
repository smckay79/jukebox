import { NextResponse } from "next/server";
import { addToWaitlist } from "@/lib/waitlist";

export async function POST(req: Request) {
  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-body" }, { status: 400 });
  }

  const email = (body.email ?? "").toString().trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: "invalid-email" }, { status: 400 });
  }

  const added = await addToWaitlist(email);
  return NextResponse.json({ ok: true, new: added });
}
