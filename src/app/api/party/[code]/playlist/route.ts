import { NextResponse } from "next/server";
import {
  getPartyPlaylistItems,
  replacePartyPlaylist,
  toPublicParty,
  getHostTier,
  verifyAdmin,
} from "@/lib/store";
import type { PlaylistTrack } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: read the party's background playlist items so the host can
// edit them (reorder / remove / add from history).
export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const items = await getPartyPlaylistItems(params.code);
  if (items === null) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }
  return NextResponse.json({ items });
}

// Admin-only: replace the party's background playlist with an edited list.
// An empty list clears the playlist.
export async function PUT(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { items?: PlaylistTrack[] } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  const res = await replacePartyPlaylist(params.code, items);
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  const tier = await getHostTier(res.party);
  return NextResponse.json({
    party: toPublicParty(res.party, tier),
    count: res.count,
  });
}
