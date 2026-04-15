import { notFound } from "next/navigation";
import { getParty, toPublicParty } from "@/lib/store";
import DisplayView from "@/components/DisplayView";

export const dynamic = "force-dynamic";

// Stable URL for TV / Android / Fire TV display clients. Renders the
// party's now-playing video, up-next strip, marquee, and join QR — no
// admin or guest chrome. Consumed by the jukebox-android WebView app
// and safe to open on any Chromecast / desktop browser in tabbed mode.
//
// Kept as a separate route (rather than a ?display=1 query param) so
// the render is guaranteed chrome-free from first paint: we don't even
// load PartyRoom on the server, so there's no flash of host UI before
// the client hides it. The Android app targets this URL directly.
export default async function PartyDisplayPage({
  params,
}: {
  params: { code: string };
}) {
  const party = await getParty(params.code);
  if (!party) notFound();
  return <DisplayView initial={toPublicParty(party)} />;
}
