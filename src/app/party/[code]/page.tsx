import { notFound } from "next/navigation";
import { getParty, toPublicParty } from "@/lib/store";
import PartyRoom from "@/components/PartyRoom";

export const dynamic = "force-dynamic";

export default async function PartyPage({
  params,
}: {
  params: { code: string };
}) {
  const party = await getParty(params.code);
  if (!party) notFound();
  return <PartyRoom initial={toPublicParty(party)} />;
}
