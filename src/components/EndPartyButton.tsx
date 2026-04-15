"use client";

import { useState } from "react";
import type { PartyRecap, PublicParty } from "@/lib/types";

// Admin-only "End party" button. A single click does nothing dangerous;
// the second click (after the confirm modal) calls the /end endpoint,
// which finalizes the party, optionally saves the played-song list to
// the host's account, and (if RESEND_API_KEY is set) emails a recap.
// The resulting PartyRecap is lifted to the parent so it can be
// rendered in the "Party ended" view.
export default function EndPartyButton({
  code,
  adminKey,
  onEnded,
}: {
  code: string;
  adminKey: string;
  // Called with both the updated PublicParty and the recap payload.
  // Parent typically swaps the room for a recap view.
  onEnded: (party: PublicParty, recap: PartyRecap) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doEnd() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/party/${code}/end`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? "Couldn't end party");
        return;
      }
      onEnded(
        (data as { party: PublicParty }).party,
        (data as { recap: PartyRecap }).recap,
      );
    } catch {
      setError("Network error — try again?");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md bg-red-700/80 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
        title="Stop the party, save the history to your account, and email a recap"
      >
        End party
      </button>

      {confirming ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !submitting && setConfirming(false)}
        >
          <div
            className="card w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">End this party?</h2>
            <p className="mt-2 text-sm text-white/70">
              The queue will stop, guests will see a recap, and the party
              will be archived (read-only for 7 days). If you&apos;re signed
              in, the played songs will be saved to your playlists and a
              recap will be emailed to you.
            </p>
            {error ? (
              <p className="mt-2 text-xs text-red-400">{error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="btn-ghost !px-3 !py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doEnd}
                disabled={submitting}
                className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
              >
                {submitting ? "Ending…" : "Yes, end it"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
