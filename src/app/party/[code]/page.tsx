import { notFound } from "next/navigation";
import { getHostTier, getParty, toPublicParty } from "@/lib/store";
import PartyRoom from "@/components/PartyRoom";

export const dynamic = "force-dynamic";

export default async function PartyPage({
  params,
}: {
  params: { code: string };
}) {
  const party = await getParty(params.code);
  if (!party) notFound();
  const tier = await getHostTier(party);
  return <PartyRoom initial={toPublicParty(party, tier)} />;
}
