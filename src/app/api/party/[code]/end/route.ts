import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { sendRecapEmail } from "@/lib/email";
import { buildRecap } from "@/lib/recap";
import {
  endParty,
  recordRecapDelivery,
  toPublicParty,
  verifyAdmin,
} from "@/lib/store";
import { createPlaylist } from "@/lib/users";
import type { PartyRecap } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin-only: end the party and return a recap. When the host is
// signed in we also save the played-song list as one of their saved
// playlists, and (if email is configured) fire off a recap email to
// the address on their Google account. All three side-effects are
// best-effort — the recap payload is always returned, with status
// objects explaining what happened.
//
// Gated by the x-admin-key header (same pattern as /admin). Session
// is optional; without it we skip the playlist+email steps and just
// flip the end flag.
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
) {
  const adminKey = req.headers.get("x-admin-key");
  if (!(await verifyAdmin(params.code, adminKey))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const res = await endParty(params.code);
  if (!res.ok) {
    const status = res.error === "Party not found" ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  const party = res.party;
  const recap: PartyRecap = buildRecap(party);

  // If the party was already ended on a previous call, skip the
  // side-effects (no duplicate playlist, no duplicate email) and
  // reconstruct the status blocks from the persisted flags so the
  // recap view stays informative on reload.
  if (res.alreadyEnded) {
    if (party.recapEmailSent && party.recapEmailTo) {
      recap.emailStatus = { ok: true, to: party.recapEmailTo };
    }
    if (party.recapSavedPlaylist) {
      recap.savedPlaylist = {
        ok: true,
        id: party.recapSavedPlaylist.id,
        name: party.recapSavedPlaylist.name,
        count: party.recapSavedPlaylist.count,
      };
    }
    return NextResponse.json({
      party: toPublicParty(party),
      recap,
      alreadyEnded: true,
    });
  }

  // Signed-in host → save a copy of the played tracks as a reusable
  // saved playlist. Default name "<Party Name> — <YYYY-MM-DD>" so the
  // list stays self-documenting over time.
  const user = await getSessionUser();
  if (user && recap.history.length > 0) {
    const dateTag = new Date(recap.endedAt).toISOString().slice(0, 10);
    const plName = `${party.name} — ${dateTag}`.slice(0, 80);
    // Dedupe by videoId (a song replayed twice shouldn't appear twice
    // in the saved copy). Preserve chronological first-play order.
    const seen = new Set<string>();
    const items: { videoId: string; title: string; thumbnail: string }[] = [];
    for (const h of recap.history) {
      if (seen.has(h.videoId)) continue;
      seen.add(h.videoId);
      items.push({
        videoId: h.videoId,
        title: h.title,
        thumbnail: h.thumbnail,
      });
    }
    if (items.length > 0) {
      const save = await createPlaylist(user.id, plName, items);
      if (save.ok) {
        recap.savedPlaylist = {
          ok: true,
          id: save.playlist.id,
          name: save.playlist.name,
          count: save.playlist.items.length,
        };
        await recordRecapDelivery(params.code, {
          savedPlaylist: {
            id: save.playlist.id,
            name: save.playlist.name,
            count: save.playlist.items.length,
          },
        });
      } else {
        recap.savedPlaylist = { ok: false, reason: save.error };
      }
    }
  }

  // Email — only if a signed-in host is present (we need their email).
  // alreadyEnded was handled above, so this path is the first-end case.
  if (user) {
    const send = await sendRecapEmail(user.email, recap);
    if (send.ok) {
      recap.emailStatus = { ok: true, to: user.email };
      await recordRecapDelivery(params.code, {
        emailSent: true,
        emailTo: user.email,
      });
    } else {
      recap.emailStatus = {
        ok: false,
        reason: send.reason ?? "unknown",
      };
    }
  }

  return NextResponse.json({
    party: toPublicParty(party),
    recap,
    alreadyEnded: res.alreadyEnded,
  });
}
