import { NextResponse } from "next/server";
import {
  addBumper,
  banVideo,
  clearPartyPlaylist,
  removeBumper,
  removeSong,
  setCountry,
  setMarquee,
  setTheme,
  skipCurrent,
  toPublicParty,
  unbanVideo,
  verifyAdmin,
} from "@/lib/store";
import { banIp, unbanIp } from "@/lib/stats";
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
    ip?: string;
    country?: string | null;
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

  if (body.action === "country") {
    const raw = body.country === undefined ? null : body.country;
    const res = await setCountry(
      params.code,
      raw === null ? null : raw.toString(),
    );
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

  if (body.action === "banIp") {
    const ip = (body.ip ?? "").toString().trim().slice(0, 64);
    if (!ip) {
      return NextResponse.json({ error: "Missing ip" }, { status: 400 });
    }
    const ban = await banIp(params.code, ip);
    if (!ban) {
      return NextResponse.json(
        { error: "Can't ban an unknown IP" },
        { status: 400 },
      );
    }
    return NextResponse.json({ ban });
  }

  if (body.action === "unbanIp") {
    const ip = (body.ip ?? "").toString().trim().slice(0, 64);
    if (!ip) {
      return NextResponse.json({ error: "Missing ip" }, { status: 400 });
    }
    await unbanIp(params.code, ip);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "addBumper") {
    let videoId = body.videoId ?? "";
    if (body.url) videoId = parseYouTubeId(body.url) ?? videoId;
    videoId = videoId.toString().trim();
    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId or url" }, { status: 400 });
    }
    let title = (body.title ?? "").toString().trim();
    let thumbnail = (body.thumbnail ?? "").toString().trim();
    if (!title || !thumbnail) {
      const meta = await fetchVideoMeta(videoId);
      if (meta) {
        title = title || meta.title;
        thumbnail = thumbnail || meta.thumbnail;
      }
    }
    const res = await addBumper(params.code, { videoId, title, thumbnail });
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 404 });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  if (body.action === "removeBumper") {
    const videoId = (body.videoId ?? "").toString().trim();
    if (!videoId) {
      return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
    }
    const res = await removeBumper(params.code, videoId);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 404 });
    }
    return NextResponse.json({ party: toPublicParty(res.party) });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
