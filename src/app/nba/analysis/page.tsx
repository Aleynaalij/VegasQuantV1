import NbaResearchTab from "@/components/nba-research-tab";
import { Shell } from "@/components/ui";
export const metadata = {
  title: "NBA research | Vegas Quant",
  description: "NBA season trends, injuries and lines. Research, not picks.",
};
// The former research tab (Oct 28) lives here now that the NBA desk is live again (#166).
export default function Page() {
  return (
    <Shell active="game" sport="nba">
      <NbaResearchTab />
    </Shell>
  );
}
