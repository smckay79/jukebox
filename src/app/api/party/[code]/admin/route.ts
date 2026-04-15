import { NextResponse } from "next/server";
import {
  banVideo,
  clearPartyPlaylist,
  removeSong,
  setMarquee,
  setTheme,
  skipCurrent,
  toPublicParty,
  unbanVideo,
  verifyAdmin,
} from "@/lib/store";
import type { PartyTheme } from "@/lib/types";
import { fetchVideoMeta, parseYouTubeId } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST body:
//   { action: "skip" }
//   { action: "remove", songId }
//   { action: "ban", videoId | url, title?, thumbnail? }
//   { action: "unban", videoId }
//
// Admin key is sent via the `x-admin-key` header.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const key = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, key))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    action?: string;
    songId?: string;
    videoId?: string;
    url?: string;
    title?: string;
    thumbnail?: string;
    theme?: PartyTheme | null;
    marquee?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.action === "skip") {
    const res = await skipCurrent(params.code);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 404 });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "remove") {
    const songId = (body.songId ?? "").toString();
    if (!songId) {
      return NextResponse.json({ error: "Missing songId" }, { status: 400 });
    }
    const res = await removeSong(params.code, songId);
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "ban") {
    const raw = body.videoId ?? body.url ?? "";
    const videoId = parseYouTubeId(raw);
    if (!videoId) {
      return NextResponse.json(
        { error: "Could not recognize that as a YouTube URL or video ID" },
        { status: 400 },
      );
    }
    // If caller didn't pass metadata (e.g. admin typed a URL into the ban
    // field), resolve it via oEmbed so the banned list can display it.
    let title = (body.title ?? "").toString().trim().slice(0, 200);
    let thumbnail = (body.thumbnail ?? "").toString().trim().slice(0, 500);
    if (!title || !thumbnail) {
      const meta = await fetchVideoMeta(videoId);
      if (meta) {
        title = title || meta.title;
        thumbnail = thumbnail || meta.thumbnail;
      }
    }
    const res = await banVideo(params.code, { videoId, title, thumbnail });
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "unban") {
    const videoId = (body.videoId ?? "").toString();
    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
    }
    const res = await unbanVideo(params.code, videoId);
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "theme") {
    const res = await setTheme(params.code, body.theme ?? null);
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "marquee") {
    const res = await setMarquee(params.code, body.marquee ?? "");
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "clearPlaylist") {
    const res = await clearPartyPlaylist(params.code);
    if (!res.ok) {
      const status = res.error === "Party not found" ? 404 : 400;
      return NextResponse.json({ error: res.error }, { status });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
