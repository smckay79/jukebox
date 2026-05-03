import { getAllParties, endParty } from "./store";
import { getUser } from "./users";
import { sendInactivityCleanupEmail } from "./email";
import { isAdminEmail } from "./admin";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export interface CleanupResult {
  success: boolean;
  partiesChecked: number;
  partiesClosed: number;
  timestamp: number;
}

export async function runPartyCleanup(): Promise<CleanupResult> {
  const now = Date.now();
  let closedCount = 0;
  let checkedCount = 0;

  try {
    const parties = await getAllParties();
    checkedCount = parties.length;

    for (const party of parties) {
      // Skip if already ended
      if (party.endedAt) continue;

      // Skip if created by an admin (admins can run parties as long as they want)
      if (party.hostUserId) {
        const hostUser = await getUser(party.hostUserId);
        if (hostUser && isAdminEmail(hostUser.email)) {
          continue;
        }
      }

      // Skip if created less than 6 hours ago
      const ageMs = now - party.createdAt;
      if (ageMs < SIX_HOURS_MS) continue;

      // Check for any activity: songs queued or currently playing
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
        try {
          const user = await getUser(party.hostUserId);
          if (user && user.email) {
            await sendInactivityCleanupEmail(user.email, party.name, party.code);
          }
        } catch (err) {
          console.error(`[cleanup] Failed to send email for party ${party.code}:`, err);
          // Don't fail the whole job for a single email failure
        }
      }

      closedCount++;
      console.log(`[cleanup] Closed inactive party: ${party.code} (${party.name})`);
    }

    return {
      success: true,
      partiesChecked: checkedCount,
      partiesClosed: closedCount,
      timestamp: now,
    };
  } catch (err) {
    console.error("[cleanup] Worker failed:", err);
    return {
      success: false,
      partiesChecked: checkedCount,
      partiesClosed: closedCount,
      timestamp: now,
    };
  }
}
