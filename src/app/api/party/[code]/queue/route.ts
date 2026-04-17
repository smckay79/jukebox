import { NextResponse } from "next/server";
import { addSong, getHostTier, getParty, toPublicParty } from "@/lib/store";
import { isGloballyBanned } from "@/lib/flagged";
import { getClientIp, isIpBanned, logActivity } from "@/lib/stats";
import { isPartyExpired } from "@/lib/subscription";
import { getUser } from "@/lib/users";
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
    // Optional, only trusted as a UX hint when adding from search results —
    // we sanitize length but don't re-verify against YouTube.
    title?: string;
    thumbnail?: string;
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
  if (await isGloballyBanned(videoId)) {
    return NextResponse.json(
      { error: "This video isn't available for playback." },
      { status: 400 },
    );
  }

  const userId = (body.userId ?? "").toString().slice(0, 64);
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  const addedBy = (body.addedBy ?? "Anonymous").toString().slice(0, 40);

  // IP muted by the host? Reject with a message that tells the guest
  // their ban lifts in an hour (the TTL we set in stats).
  const ip = getClientIp(req);
  if (await isIpBanned(params.code, ip)) {
    return NextResponse.json(
      {
        error:
          "Your network is muted from adding songs at this party for an hour.",
      },
      { status: 403 },
    );
  }

  // Enforce 1-hour limit for free-tier hosts.
  const party = await getParty(params.code);
  if (party) {
    const hostUser = party.hostUserId ? await getUser(party.hostUserId) : null;
    if (isPartyExpired(party.createdAt, hostUser)) {
      return NextResponse.json(
        {
          error: "This party has reached its 1-hour limit. The host needs a Pro subscription for unlimited parties.",
          reason: "party_time_limit",
        },
        { status: 403 },
      );
    }
  }

  // If the caller already has metadata (e.g. came via /api/search), skip the
  // oEmbed roundtrip. Otherwise resolve title/thumbnail on the server.
  const providedTitle = (body.title ?? "").toString().trim().slice(0, 200);
  const providedThumb = (body.thumbnail ?? "").toString().trim().slice(0, 500);
  const meta = providedTitle
    ? {
        title: providedTitle,
        thumbnail:
          providedThumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      }
    : (await fetchVideoMeta(videoId)) ?? {
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
  // Fire-and-forget: admin stats panel relies on this log, but a failed
  // write shouldn't block the user's successful add.
  logActivity(params.code, [
    {
      at: Date.now(),
      ip,
      userId,
      videoId,
      title: result.song.title,
      addedBy: result.song.addedBy,
      kind: "single",
    },
  ]).catch(() => {});
  return NextResponse.json({
    song: result.song,
    party: toPublicParty(result.party),
  });
}
