import { NextResponse } from "next/server";
import { addSong, toPublicParty } from "@/lib/store";
import { fetchVideoMeta, parseYouTubeId } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  let body: {
    url?: string;
    videoId?: string;
    addedBy?: string;
    userId?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.videoId ?? body.url ?? "";
  const videoId = parseYouTubeId(raw);
  if (!videoId) {
    return NextResponse.json(
      { error: "Could not recognize that as a YouTube URL or video ID" },
      { status: 400 },
    );
  }
  const userId = (body.userId ?? "").toString().slice(0, 64);
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  const addedBy = (body.addedBy ?? "Anonymous").toString().slice(0, 40);

  const meta = (await fetchVideoMeta(videoId)) ?? {
    title: "YouTube video",
    thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };

  const result = await addSong(params.code, {
    videoId,
    title: meta.title,
    thumbnail: meta.thumbnail,
    addedBy,
    addedByUserId: userId,
  });
  if (!result.ok) {
    const status = result.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({
    song: result.song,
    party: toPublicParty(result.party),
  });
}
