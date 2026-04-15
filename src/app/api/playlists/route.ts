import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createPlaylist, listUserPlaylists } from "@/lib/users";
import type { PlaylistTrack } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — list the signed-in user's saved playlists (summary shape).
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const playlists = await listUserPlaylists(user.id);
  return NextResponse.json({ playlists });
}

// POST — create a new playlist.
// Body: { name: string, items: PlaylistTrack[] }
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let body: { name?: string; items?: PlaylistTrack[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  const res = await createPlaylist(user.id, body.name ?? "", items);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ playlist: res.playlist });
}
