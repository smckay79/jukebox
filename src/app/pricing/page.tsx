import { Suspense } from "react";
import PricingCards from "@/components/PricingCards";

export const metadata = { title: "Jukebox Pro — Pricing" };

export default function PricingPage() {
  return (
    <Suspense>
      <PricingCards />
    </Suspense>
  );
}
