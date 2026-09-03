import { NextResponse } from "next/server";
import { getParty } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Primary: our own always-on extractor service (youtubei.js + a self-hosted
// PO-token provider — see /extractor). Configured via env; if unset or
// unreachable, we fall through to the legacy Piped/Invidious chain below as
// a last-resort fallback rather than hard-failing.
const VIDEO_EXTRACTOR_URL = process.env.VIDEO_EXTRACTOR_URL;
const VIDEO_EXTRACTOR_SECRET = process.env.VIDEO_EXTRACTOR_SECRET;

async function extractViaOwnService(videoId: string) {
  if (!VIDEO_EXTRACTOR_URL || !VIDEO_EXTRACTOR_SECRET) return null;
  const res = await fetch(
    `${VIDEO_EXTRACTOR_URL}/video-info?id=${encodeURIComponent(videoId)}`,
    {
      headers: { Authorization: `Bearer ${VIDEO_EXTRACTOR_SECRET}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`extractor returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    url: string;
    type: string;
    quality: string;
  };
  return { url: data.url, type: data.type, quality: data.quality };
}

// ---------- legacy fallback: public Piped/Invidious instances ----------
// Kept deliberately, not deleted — cheap insurance for the rare case where
// our own extractor service itself is down. This is the ONLY thing this
// route used to rely on; as of the extractor above, it's a last resort.

const PIPED_INSTANCES = [
  "https://api.piped.private.coffee",
  "https://pipedapi.darkness.services",
  "https://pipedapi.adminforge.de",
];

const INVIDIOUS_INSTANCES = [
  "https://invidious.darkness.services",
];

async function extractViaPiped(videoId: string, instanceUrl: string) {
  const res = await fetch(`${instanceUrl}/streams/${videoId}`, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "VideoJam/1.0" },
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
    mimeType: string;
  }>;

  const combined = streams
    .filter((s) => !s.videoOnly)
    .sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

  const mp4 = combined.filter(
    (s) => s.format === "MPEG_4" || s.mimeType?.includes("video/mp4"),
  );
  if (mp4.length > 0) {
    return { url: mp4[0].url, type: "mp4", quality: mp4[0].quality };
  }

  if (combined.length > 0) {
    return { url: combined[0].url, type: "mp4", quality: combined[0].quality };
  }

  return null;
}

async function extractViaInvidiousProxy(
  videoId: string,
  instanceUrl: string,
) {
  const res = await fetch(
    `${instanceUrl}/api/v1/videos/${videoId}?fields=formatStreams,adaptiveFormats`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) return null;
  const data = await res.json();

  const formats = (data.formatStreams ?? []) as Array<{
    url: string;
    qualityLabel: string;
    container: string;
    itag: string;
  }>;

  const mp4 = formats.filter((f) => f.container === "mp4");
  if (mp4.length > 0) {
    const proxiedUrl = `${instanceUrl}/latest_version?id=${videoId}&itag=${mp4[0].itag}`;
    return { url: proxiedUrl, type: "mp4", quality: mp4[0].qualityLabel };
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

  const errors: string[] = [];

  try {
    const result = await extractViaOwnService(videoId);
    if (result) {
      return NextResponse.json({ ...result, source: "extractor" });
    }
  } catch (e: unknown) {
    errors.push(`extractor: ${e instanceof Error ? e.message : "unknown"}`);
  }

  for (const instance of PIPED_INSTANCES) {
    try {
      const result = await extractViaPiped(videoId, instance);
      if (result) {
        return NextResponse.json({ ...result, source: "piped" });
      }
    } catch (e: unknown) {
      errors.push(
        `piped(${instance}): ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const result = await extractViaInvidiousProxy(videoId, instance);
      if (result) {
        return NextResponse.json({ ...result, source: "invidious" });
      }
    } catch (e: unknown) {
      errors.push(
        `invidious(${instance}): ${e instanceof Error ? e.message : "unknown"}`,
      );
    }
  }

  return NextResponse.json(
    {
      error: "No playable format found from any source",
      tried: errors,
    },
    { status: 502 },
  );
}
