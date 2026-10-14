import { getDeskOrEmpty } from "@/lib/data";
import MatchupIntelligence from "@/components/matchup-intelligence";
export const dynamic = "force-dynamic";
export const metadata = { title: "The Zone · Games | Vegas Quant" };
export default async function Page() {
  return <MatchupIntelligence initial={await getDeskOrEmpty()} />;
}
