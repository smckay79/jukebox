import { NextResponse } from "next/server";
import { SESSION_COOKIE, destroySessionFromCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await destroySessionFromCookie();
  const res = NextResponse.json({ ok: true });
  // Clear the cookie by setting maxAge=0.
  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
