import { NextResponse } from "next/server";
import { setPartyPlaylist, toPublicParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Imports a playlist as the party's background playlist. The tracks loop
// whenever the user queue is empty; any user-added song interrupts the
// background track and takes priority. Capped at 100 items to match the
// preview endpoint.
const MAX_ITEMS = 100;

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: {
    items?: Array<{ videoId?: string; title?: string; thumbnail?: string }>;
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

  const res = await setPartyPlaylist(params.code, cleanItems);
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({
    party: toPublicParty(res.party),
    count: res.count,
  });
}
