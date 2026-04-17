import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import {
  addSkipBumper,
  listSkipBumpers,
  removeSkipBumper,
  toggleSkipBumper,
} from "@/lib/skip-bumpers";
import { fetchVideoMeta, parseYouTubeId } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const bumpers = await listSkipBumpers();
  return NextResponse.json({ bumpers });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    action?: string;
    videoId?: string;
    url?: string;
    title?: string;
    thumbnail?: string;
    enabled?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "add") {
    const raw = body.videoId ?? body.url ?? "";
    const videoId = parseYouTubeId(raw);
    if (!videoId) {
      return NextResponse.json(
        { error: "Could not parse YouTube video ID" },
        { status: 400 },
      );
    }
    const providedTitle = (body.title ?? "").toString().trim().slice(0, 200);
    const providedThumb = (body.thumbnail ?? "").toString().trim().slice(0, 500);
    const meta = providedTitle
      ? { title: providedTitle, thumbnail: providedThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }
      : (await fetchVideoMeta(videoId)) ?? {
          title: "Skip bumper",
          thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        };
    const bumper = await addSkipBumper(videoId, meta.title, meta.thumbnail);
    return NextResponse.json({ ok: true, bumper });
  }

  if (body.action === "remove") {
    const videoId = (body.videoId ?? "").toString();
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }
    await removeSkipBumper(videoId);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "toggle") {
    const videoId = (body.videoId ?? "").toString();
    if (!videoId) {
      return NextResponse.json({ error: "videoId required" }, { status: 400 });
    }
    const bumper = await toggleSkipBumper(videoId, !!body.enabled);
    if (!bumper) {
      return NextResponse.json({ error: "Bumper not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, bumper });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
