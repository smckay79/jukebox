import { NextResponse } from "next/server";
import { checkRegionRestriction, resolveRegion } from "@/lib/region";
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
  // Computed from videos.list regionRestriction + the host's detected
  // country. When false, the client shows a "Blocked in XX" badge and
  // auto-excludes the item from the default selection.
  available?: boolean;
  unavailableReason?: string;
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
  // Party's configured country (ISO alpha-2) wins over request-derived
  // detection when supplied; lets the host preview what'll actually be
  // playable at their party regardless of where the server happens to be.
  const countryParam = (url.searchParams.get("country") ?? "").trim();
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

    // Enrich with durations + regionRestriction in batches of 50 (the
    // videos.list max). contentDetails covers both fields so we pay only
    // 1 quota unit per batch either way.
    const region = resolveRegion(req, countryParam || null);
    const durations = new Map<string, { seconds: number; formatted: string }>();
    const availability = new Map<
      string,
      { available: boolean; reason?: string }
    >();
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
        items?: Array<{
          id?: string;
          contentDetails?: {
            duration?: string;
            regionRestriction?: { allowed?: string[]; blocked?: string[] };
          };
        }>;
      };
      for (const v of vd.items ?? []) {
        const iso = v.contentDetails?.duration ?? "";
        const s = parseISODuration(iso);
        if (v.id) {
          durations.set(v.id, { seconds: s, formatted: fmt(s) });
          availability.set(
            v.id,
            checkRegionRestriction(v.contentDetails?.regionRestriction, region),
          );
        }
      }
      // videos.list omits items that are fully unavailable (private, deleted,
      // or sometimes region-blocked from the server's own location). Mark
      // those explicitly so the preview flags them instead of silently
      // leaving them selectable.
      for (const id of chunk) {
        if (!availability.has(id)) {
          availability.set(id, {
            available: false,
            reason: "Not available",
          });
        }
      }
    }

    const preview: PreviewItem[] = items.map((it) => {
      const d = durations.get(it.videoId);
      const a = availability.get(it.videoId);
      return {
        ...it,
        durationSeconds: d?.seconds,
        duration: d?.formatted,
        available: a?.available ?? true,
        unavailableReason: a?.available === false ? a.reason : undefined,
      };
    });

    return NextResponse.json({ playlistId, region, results: preview });
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
