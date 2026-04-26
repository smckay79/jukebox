import { NextResponse } from "next/server";
import { getAllParties, endParty } from "@/lib/store";
import { getUser } from "@/lib/users";
import { sendInactivityCleanupEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron job to close parties that have been inactive for 6+ hours
// Runs periodically (can be triggered by Vercel Cron, external scheduler, etc.)
export async function GET(req: Request) {
  // Basic auth: check for a cron secret to prevent unauthorized calls
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const parties = await getAllParties();
    let closedCount = 0;

    for (const party of parties) {
      // Skip if already ended
      if (party.endedAt) continue;

      // Skip if created less than 6 hours ago
      const ageMs = now - party.createdAt;
      if (ageMs < SIX_HOURS_MS) continue;

      // Check for any activity: songs added or viewed recently
      // If there are no songs in queue/history and no current viewers,
      // it means the party is inactive
      const hasActivity = party.queue.length > 0 || party.nowPlaying !== null;

      if (hasActivity) {
        // Party still has songs queued, don't close it
        continue;
      }

      // Check if there's been any song added in the last 6 hours
      const lastSongTime = [...party.queue, ...(party.history ?? [])].reduce(
        (max, song) => Math.max(max, song.addedAt ?? 0),
        0,
      );

      if (lastSongTime > 0 && now - lastSongTime < SIX_HOURS_MS) {
        // Recent activity, keep the party
        continue;
      }

      // Party is inactive - close it and send email to host
      const endRes = await endParty(party.code);
      if (!endRes.ok) {
        console.error(`[cleanup] Failed to end party ${party.code}:`, endRes.error);
        continue;
      }

      // Send email to host if they have an account
      if (party.hostUserId) {
        const user = await getUser(party.hostUserId);
        if (user && user.email) {
          try {
            await sendInactivityCleanupEmail(user.email, party.name, party.code);
          } catch (err) {
            console.error(`[cleanup] Failed to send email for party ${party.code}:`, err);
            // Don't fail the whole job for a single email failure
          }
        }
      }

      closedCount++;
    }

    return NextResponse.json({
      success: true,
      partiesChecked: parties.length,
      partiesClosed: closedCount,
    });
  } catch (err) {
    console.error("[cleanup] Cron job failed:", err);
    return NextResponse.json(
      { error: "Cleanup job failed", details: String(err) },
      { status: 500 },
    );
  }
}
