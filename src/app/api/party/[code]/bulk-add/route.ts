import { NextResponse } from "next/server";
import { addSongs, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bulk-add endpoint used by the playlist importer. Accepts the videos
// already previewed client-side (we trust the client-provided title /
// thumbnail because they came from our own /api/youtube/playlist endpoint
// moments before). The underlying addSongs batches the writes so one
// import = one Redis round-trip.
const MAX_ITEMS = 100;

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: {
    items?: Array<{ videoId?: string; title?: string; thumbnail?: string }>;
    addedBy?: string;
    userId?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ error: "No items to add" }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${MAX_ITEMS} items per import` },
      { status: 400 },
    );
  }

  const userId = (body.userId ?? "").toString().trim().slice(0, 64);
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const addedBy = (body.addedBy ?? "").toString().trim().slice(0, 40);

  const cleanItems = items
    .map((it) => ({
      videoId: (it.videoId ?? "").toString().trim(),
      title: (it.title ?? "").toString().slice(0, 200),
      thumbnail: (it.thumbnail ?? "").toString().slice(0, 500),
    }))
    .filter((it) => /^[A-Za-z0-9_-]{11}$/.test(it.videoId));

  if (cleanItems.length === 0) {
    return NextResponse.json(
      { error: "No valid videos in request" },
      { status: 400 },
    );
  }

  const res = await addSongs(params.code, cleanItems, {
    addedBy,
    addedByUserId: userId,
  });
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    party: toPublicParty(res.party),
    added: res.added,
    skippedDuplicate: res.skippedDuplicate,
    skippedBanned: res.skippedBanned,
  });
}
