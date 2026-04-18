import { NextResponse } from "next/server";
import { getParty } from "@/lib/store";
import ytdl from "@distube/ytdl-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PIPED_FALLBACK = "https://api.piped.private.coffee";
const INVIDIOUS_FALLBACK = "https://invidious.darkness.services";

async function extractViaYtdl(videoId: string) {
  const info = await ytdl.getInfo(videoId);

  const hlsFormat = info.formats.find(
    (f) => f.isHLS && f.hasVideo && f.hasAudio,
  );
  if (hlsFormat) {
    return { url: hlsFormat.url, type: "hls", quality: hlsFormat.qualityLabel };
  }

  const combined = info.formats
    .filter((f) => f.hasVideo && f.hasAudio && f.container === "mp4")
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0));

  if (combined.length > 0) {
    return {
      url: combined[0].url,
      type: "mp4",
      quality: combined[0].qualityLabel,
    };
  }

  return null;
}

async function extractViaPiped(videoId: string) {
  const res = await fetch(`${PIPED_FALLBACK}/streams/${videoId}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const data = await res.json();

  if (data.hls) {
    return { url: data.hls as string, type: "hls", quality: "auto" };
  }

  const streams = (data.videoStreams ?? []) as Array<{
    url: string;
    quality: string;
    videoOnly: boolean;
    format: string;
  }>;
  const combined = streams
    .filter((s) => !s.videoOnly && s.format === "MPEG_4")
    .sort(
      (a, b) =>
        parseInt(b.quality) - parseInt(a.quality),
    );
  if (combined.length > 0) {
    return { url: combined[0].url, type: "mp4", quality: combined[0].quality };
  }

  return null;
}

async function extractViaInvidious(videoId: string) {
  const res = await fetch(
    `${INVIDIOUS_FALLBACK}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return null;
  const data = await res.json();

  const formats = (data.formatStreams ?? []) as Array<{
    url: string;
    qualityLabel: string;
    type: string;
    container: string;
  }>;
  const mp4 = formats.filter((f) => f.container === "mp4");
  if (mp4.length > 0) {
    return { url: mp4[0].url, type: "mp4", quality: mp4[0].qualityLabel };
  }

  return null;
}

export async function GET(
  req: Request,
  { params }: { params: { code: string } },
) {
  const party = await getParty(params.code);
  if (!party) {
    return NextResponse.json({ error: "Party not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("v");
  if (!videoId) {
    return NextResponse.json({ error: "Missing video ID" }, { status: 400 });
  }

  const strategies = [extractViaYtdl, extractViaPiped, extractViaInvidious];

  for (const strategy of strategies) {
    try {
      const result = await strategy(videoId);
      if (result) {
        return NextResponse.json(result);
      }
    } catch {
      continue;
    }
  }

  return NextResponse.json(
    { error: "No playable format found from any source" },
    { status: 502 },
  );
}
