import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { cleanMarket, type CasinoCardData } from "@/lib/casino-card";
export type AutomaticResult = {
  player: string;
  market: string;
  result: string;
  value: number;
  metric: string;
  espn_url: string;
  nflverse_url: string;
  verified_at: string;
};
export default function AutomaticResultCard({
  details: d,
  matchup,
  publishedAt,
}: {
  details: AutomaticResult;
  matchup: string;
  publishedAt: string;
}) {
  const won = d.result === "WIN",
    push = d.result === "PUSH";
  const card: CasinoCardData = {
    variant: won ? "win" : "miss",
    eyebrow: "Verified result · full game incl. OT",
    title: d.player,
    market: cleanMarket(d.market),
    matchup,
    hero: {
      label: `Final ${d.metric.replace(/_/g, " ")}`,
      value: String(d.value),
      note: won ? "Target cleared" : push ? "Landed on the number" : "Fell short",
    },
    stamp: won ? "✓ HIT" : push ? "PUSH" : "MISS",
    footnote: "ESPN final box score corroborated by nflverse. A published leg’s result, not a wager or payout.",
    publishedAt,
  };
  return (
    <div>
      <CasinoCard data={card} />
      <p className="vqc-sources">
        <a href={d.espn_url} target="_blank" rel="noopener noreferrer">
          Final box score ↗
        </a>{" "}
        ·{" "}
        <a href={d.nflverse_url} target="_blank" rel="noopener noreferrer">
          Weekly stats ↗
        </a>
      </p>
      <CasinoCardDownload data={card} />
    </div>
  );
}
