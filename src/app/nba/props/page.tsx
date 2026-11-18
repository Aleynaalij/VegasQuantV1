import { Suspense } from "react";
import NbaPropsBoard from "@/components/nba-props-board";
import { Shell } from "@/components/ui";
export const metadata = {
  title: "NBA Prop Finder | Vegas Quant",
  description:
    "Tonight's NBA player props ranked by our estimate, hit rates and best price across books. Research, not picks.",
};
export default function Page() {
  return (
    <Shell active="game" sport="nba">
      <Suspense fallback={null}>
        <NbaPropsBoard />
      </Suspense>
    </Shell>
  );
}
