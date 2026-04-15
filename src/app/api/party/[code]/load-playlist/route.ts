import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { setPartyPlaylist, toPublicParty, verifyAdmin } from "@/lib/store";
import { getPlaylistForOwner } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: load one of the signed-in user's saved playlists as this
// party's background playlist. Requires BOTH the x-admin-key header (so a
// random signed-in user can't push playlists to someone else's party) AND
// a valid session (so only the playlist owner can load it).
//
// Body: { playlistId: string }
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const adminKey = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, adminKey))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { playlistId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const playlistId = (body.playlistId ?? "").toString();
  if (!playlistId) {
    return NextResponse.json({ error: "Missing playlistId" }, { status: 400 });
  }

  const playlist = await getPlaylistForOwner(user.id, playlistId);
  if (!playlist) {
    return NextResponse.json({ error: "Playlist not found" }, { status: 404 });
  }

  const res = await setPartyPlaylist(params.code, playlist.items);
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    party: toPublicParty(res.party),
    count: res.count,
  });
}
