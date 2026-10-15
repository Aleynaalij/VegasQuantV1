import CasinoCard, { CasinoCardDownload } from "./casino-card";
import type { CasinoCardData } from "@/lib/casino-card";

const pregame = [
  ["Puka Nacua", "60+ receiving yards", "138"],
  ["James Cook", "50+ rushing yards", "111"],
  ["Kyren Williams", "40+ rushing yards", "49"],
  ["Matthew Stafford", "220+ passing yards", "383"],
  ["Josh Allen", "200+ passing yards", "210"],
];
const live = [
  ["James Cook", "70+ rushing yards", "111"],
  ["Kyren Williams", "40+ rushing yards", "49"],
  ["Josh Allen", "25+ rushing yards", "121"],
  ["Puka Nacua", "60+ receiving yards", "138"],
  ["Davante Adams", "30+ receiving yards", "51"],
  ["Tyler Higbee", "20+ receiving yards", "83"],
];

export default function BillsWinningSlip({ publishedAt, halftime = false }: { publishedAt: string; halftime?: boolean }) {
  const legs = halftime ? live : pregame;
  const card: CasinoCardData = {
    variant: "win",
    eyebrow: `Monday night · Oct 12 · ${halftime ? "halftime selections" : "full game"}`,
    title: halftime ? "Six halftime legs. Six hits." : "Five legs. One $531.92 win.",
    matchup: "Bills @ Rams · Final: BUF 37 — LAR 34 (OT)",
    hero: halftime
      ? { label: "Published legs cleared", value: "6 / 6", note: "Stake & payout not supplied" }
      : { label: "Total payout", value: "$531.92", note: "+$313.92 profit · $218 stake · +144" },
    stamp: halftime ? "HIT 6/6" : "WIN 5/5",
    legs: legs.map(([name, market, final]) => ({ name, market, note: `final ${final}`, status: "won" as const })),
    footnote: halftime
      ? "Verified results of the six published halftime selections. Full-game totals include overtime."
      : "DraftKings · owner-submitted settled ticket. Payout includes the $218 stake.",
    publishedAt,
  };
  return (
    <div>
      <CasinoCard data={card} />
      <CasinoCardDownload data={card} />
    </div>
  );
}
