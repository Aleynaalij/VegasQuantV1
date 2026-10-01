import { getDesk } from "@/lib/data";
import GameIndex from "@/components/game-index";
export const dynamic = "force-dynamic";
export const metadata = { title: "Matchup index | Vegas Quant" };
export default async function GamesPage() {
  return <GameIndex games={(await getDesk()).games} />;
}
