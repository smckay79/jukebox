import { NextResponse } from "next/server";
import { parsePlaylistId } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Preview a YouTube (or YouTube Music) playlist so the user can pick which
// of their favorites to drop into the queue. Capped at PLAYLIST_MAX items
// to keep the quota spend bounded — each playlistItems.list page costs 1
// unit and each videos.list call costs 1 unit, so a 50-item pull is ~3
// quota units. YouTube's "Liked music" auto-playlist works here as long
// as the user has made it at least unlisted.
const PLAYLIST_MAX = 100;
const PAGE = 50;

interface PreviewItem {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  durationSeconds?: number;
  duration?: string;
}

export async function GET(req: Request) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Playlist import isn't configured on the server." },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const raw = (url.searchParams.get("id") ?? "").trim();
  if (!raw) {
    return NextResponse.json({ error: "Missing playlist" }, { status: 400 });
  }
  const playlistId = parsePlaylistId(raw);
  if (!playlistId) {
    return NextResponse.json(
      { error: "Couldn't read that as a playlist URL or ID" },
      { status: 400 },
    );
  }

  try {
    const items: {
      videoId: string;
      title: string;
      channelTitle: string;
      thumbnail: string;
    }[] = [];
    let pageToken: string | undefined;
    while (items.length < PLAYLIST_MAX) {
      const qs = new URLSearchParams({
        part: "snippet",
        playlistId,
        maxResults: String(Math.min(PAGE, PLAYLIST_MAX - items.length)),
        key,
      });
      if (pageToken) qs.set("pageToken", pageToken);
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?${qs.toString()}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        // 403 most commonly means the playlist is private; surface a
        // friendly message.
        if (res.status === 403 || res.status === 404) {
          return NextResponse.json(
            {
              error:
                "Couldn't open that playlist. Make sure it's public or unlisted.",
            },
            { status: 400 },
          );
        }
        return NextResponse.json(
          { error: "YouTube playlist lookup failed" },
          { status: 502 },
        );
      }
      const data = (await res.json()) as {
        nextPageToken?: string;
        items?: Array<{
          snippet?: {
            title?: string;
            videoOwnerChannelTitle?: string;
            channelTitle?: string;
            resourceId?: { videoId?: string };
            thumbnails?: {
              default?: { url?: string };
              medium?: { url?: string };
            };
          };
        }>;
      };
      for (const it of data.items ?? []) {
        const sn = it.snippet ?? {};
        const vid = sn.resourceId?.videoId;
        if (!vid) continue;
        // Private/deleted videos come through with title "Private video"
        // or "Deleted video" and no resource — skip those.
        if (!sn.title || /^Private video$|^Deleted video$/i.test(sn.title)) {
          continue;
        }
        items.push({
          videoId: vid,
          title: decodeEntities(sn.title),
          channelTitle: decodeEntities(
            sn.videoOwnerChannelTitle ?? sn.channelTitle ?? "",
          ),
          thumbnail:
            sn.thumbnails?.medium?.url ??
            sn.thumbnails?.default?.url ??
            `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`,
        });
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }

    // Enrich with durations in batches of 50 (the videos.list max).
    const durations = new Map<string, { seconds: number; formatted: string }>();
    for (let i = 0; i < items.length; i += 50) {
      const chunk = items.slice(i, i + 50).map((x) => x.videoId);
      const qs = new URLSearchParams({
        part: "contentDetails",
        id: chunk.join(","),
        key,
      });
      const vr = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${qs.toString()}`,
        { cache: "no-store" },
      );
      if (!vr.ok) continue; // non-fatal; preview just won't show duration
      const vd = (await vr.json()) as {
        items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
      };
      for (const v of vd.items ?? []) {
        const iso = v.contentDetails?.duration ?? "";
        const s = parseISODuration(iso);
        if (v.id) durations.set(v.id, { seconds: s, formatted: fmt(s) });
      }
    }

    const preview: PreviewItem[] = items.map((it) => {
      const d = durations.get(it.videoId);
      return {
        ...it,
        durationSeconds: d?.seconds,
        duration: d?.formatted,
      };
    });

    return NextResponse.json({ playlistId, results: preview });
  } catch {
    return NextResponse.json(
      { error: "Playlist import failed" },
      { status: 500 },
    );
  }
}

function parseISODuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  const h = parseInt(m[1] ?? "0", 10);
  const min = parseInt(m[2] ?? "0", 10);
  const s = parseInt(m[3] ?? "0", 10);
  return h * 3600 + min * 60 + s;
}

function fmt(total: number): string {
  if (total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
