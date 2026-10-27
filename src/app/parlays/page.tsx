import { Suspense } from "react";
import { Shell } from "@/components/ui";
import ParlayWorkshop from "@/components/parlay-workshop";
export const metadata = { title: "Your lay | Vegas Quant" };
export default function Page() {
  return (
    <Shell active="home">
      <h1>Your lay</h1>
      <Suspense fallback={<p role="status">Loading your lays…</p>}>
        <ParlayWorkshop mode="parlays" />
      </Suspense>
    </Shell>
  );
}
