import CasinoCard, { CasinoCardDownload } from "./casino-card";
import type { CasinoCardData } from "@/lib/casino-card";

/** Retrospective owner-supplied ticket recap; does not grade challenge records. */
export default function RavensWinningSlip({ publishedAt }: { publishedAt: string }) {
  const card: CasinoCardData = {
    variant: "win",
    eyebrow: "Sunday night · Oct 11 · full game",
    title: "Five legs. One $218 win.",
    matchup: "Ravens @ Falcons · Final: BAL 30 — ATL 23 (OT)",
    hero: { label: "Total payout", value: "$218.00", note: "+$118 profit · $100 stake · +118" },
    stamp: "WIN 5/5",
    legs: [
      ["Bijan Robinson", "70+ rushing yards"],
      ["Drake London", "50+ receiving yards"],
      ["Michael Penix Jr.", "150+ passing yards"],
      ["Derrick Henry", "40+ rushing yards"],
      ["Mark Andrews", "15+ receiving yards"],
    ].map(([name, market]) => ({ name, market, status: "won" as const })),
    footnote: "DraftKings · owner-submitted settled ticket. Payout includes the $100 stake.",
    publishedAt,
  };
  return (
    <div>
      <CasinoCard data={card} />
      <CasinoCardDownload data={card} />
    </div>
  );
}
