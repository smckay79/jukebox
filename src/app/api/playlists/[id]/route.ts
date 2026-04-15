import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import {
  deletePlaylist,
  getPlaylistForOwner,
  updatePlaylist,
} from "@/lib/users";
import type { PlaylistTrack } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET — fetch full playlist (with items). Only the owner can read it; we
// don't expose playlists by ID to anyone else.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const p = await getPlaylistForOwner(user.id, params.id);
  if (!p) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }
  return NextResponse.json({ playlist: p });
}

// PUT — update name and/or items.
// Body: { name?: string, items?: PlaylistTrack[] }
export async function PUT(
  req: Request,
  { params }: { params: { id: string } },
) {
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
  const res = await updatePlaylist(user.id, params.id, {
    name: body.name,
    items: Array.isArray(body.items) ? body.items : undefined,
  });
  if (!res.ok) {
    const status = res.error === "Playlist not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ playlist: res.playlist });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const res = await deletePlaylist(user.id, params.id);
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
