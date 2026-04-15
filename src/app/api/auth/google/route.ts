import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  toPublicUser,
  verifyGoogleIdToken,
} from "@/lib/auth";
import { upsertUserFromGoogle } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Client posts the Google Identity Services ID token here. We verify it
// against Google's tokeninfo endpoint, upsert the user, mint an opaque
// session, and drop the signed cookie.
export async function POST(req: Request) {
  let body: { credential?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const credential = (body.credential ?? "").toString();
  if (!credential) {
    return NextResponse.json({ error: "Missing credential" }, { status: 400 });
  }

  const claims = await verifyGoogleIdToken(credential);
  if (!claims) {
    return NextResponse.json(
      { error: "Google sign-in rejected that token." },
      { status: 401 },
    );
  }

  const user = await upsertUserFromGoogle(claims);
  const cookie = await createSession(user.id);

  const res = NextResponse.json({ user: toPublicUser(user) });
  // httpOnly keeps the cookie out of JS, sameSite=lax lets the OAuth
  // redirect from Google still attach it. Secure in prod only so dev
  // over http still sets the cookie.
  res.cookies.set({
    name: SESSION_COOKIE,
    value: cookie,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
  return res;
}
