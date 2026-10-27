import CasinoCard, { CasinoCardDownload } from "./casino-card";
import type { CasinoCardData } from "@/lib/casino-card";

const firstQuarterLegs = [
  ["Bhayshul Tuten", "10+ rushing yards"],
  ["Trevor Lawrence", "40+ passing yards"],
  ["Brenton Strange", "Over 3.5 receiving yards"],
  ["Dallas Goedert", "Over 3.5 receiving yards"],
  ["Jalen Hurts", "Under 33.5 passing yards"],
];
const liveLegs = [
  ["Parker Washington", "90+ receiving yards"],
  ["Dontayvion Wicks", "40+ receiving yards"],
  ["Dallas Goedert", "6+ receptions"],
  ["Trevor Lawrence", "275+ passing yards"],
  ["Darius Cooper", "70+ receiving yards"],
  ["Brenton Strange", "7+ receptions"],
];
/** Retrospective owner-supplied ticket recaps; they do not grade challenge records. */
export default function LondonWinningSlip({ publishedAt, variant = "first-quarter" }: { publishedAt: string; variant?: "first-quarter" | "live-six" }) {
  const live = variant === "live-six";
  const legs = live ? liveLegs : firstQuarterLegs;
  const card: CasinoCardData = {
    variant: "win",
    eyebrow: `London · Oct 11 · ${live ? "live full-game picks" : "first quarter"}`,
    title: live ? "Six legs. One $500 win." : "Five legs. One winning slip.",
    matchup: `Eagles @ Jaguars${live ? " · Final: PHI 17 — JAX 19" : ""}`,
    hero: live
      ? { label: "Total payout", value: "$500.00", note: "+$450 profit · $50 stake · +900" }
      : { label: "Combined odds", value: "+1353", note: "30% profit boost · base +1041" },
    stamp: `WIN ${legs.length}/${legs.length}`,
    legs: legs.map(([name, market]) => ({ name, market, note: live ? undefined : "1st quarter", status: "won" as const })),
    footnote: live ? "DraftKings · settled ticket. Payout includes the $50 stake." : undefined,
    publishedAt,
  };
  return (
    <div>
      <CasinoCard data={card} />
      <CasinoCardDownload data={card} />
    </div>
  );
}
