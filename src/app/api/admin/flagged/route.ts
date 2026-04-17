import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { listFlaggedVideos, setGlobalBan } from "@/lib/flagged";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const videos = await listFlaggedVideos();
  return NextResponse.json({ videos });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { action?: string; videoId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const videoId = (body.videoId ?? "").toString();
  if (!videoId) {
    return NextResponse.json({ error: "videoId required" }, { status: 400 });
  }

  if (body.action === "ban") {
    const v = await setGlobalBan(videoId, true);
    return NextResponse.json({ ok: true, video: v });
  }
  if (body.action === "unban") {
    const v = await setGlobalBan(videoId, false);
    return NextResponse.json({ ok: true, video: v });
  }
  if (body.action === "dismiss") {
    const v = await setGlobalBan(videoId, false);
    return NextResponse.json({ ok: true, video: v });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
