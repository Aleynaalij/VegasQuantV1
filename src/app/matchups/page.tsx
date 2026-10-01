import { getDesk } from "@/lib/data";
import MatchupIntelligence from "@/components/matchup-intelligence";
export const dynamic = "force-dynamic";
export const metadata = { title: "Search Matchup | Vegas Quant" };
export default async function Page() {
  return <MatchupIntelligence initial={await getDesk()} />;
}
