import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { getAllUsers } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const users = await getAllUsers();
  users.sort((a, b) => b.lastLoginAt - a.lastLoginAt);

  const safe = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    picture: u.picture,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  }));

  return NextResponse.json({ users: safe, total: safe.length });
}
