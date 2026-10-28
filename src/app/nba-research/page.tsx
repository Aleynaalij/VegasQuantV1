import NbaResearchTab from "@/components/nba-research-tab";
import { Shell } from "@/components/ui";

export const metadata = {
  title: "NBA research | Vegas Quant",
  description: "NBA season trends, injuries and lines. Research, not picks.",
};
export default function Page() {
  return (
    <Shell active="nbaresearch">
      <NbaResearchTab />
    </Shell>
  );
}
