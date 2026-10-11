import BrandMark from "./brand-mark";
import TeamHelmet from "./team-helmet";
import { time } from "@/lib/domain";

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
export default function LondonWinningSlip({ publishedAt, variant = "first-quarter" }: { publishedAt: string; variant?: "first-quarter" | "live-six" }) {
  const live = variant === "live-six";
  const legs = live ? liveLegs : firstQuarterLegs;
  return <article className="zone-winning-slip" aria-label={live ? "Winning combined six-leg parlay with $500 payout" : "Winning combined five-leg first-quarter parlay"}>
    <header><span className="win-brand"><BrandMark /> VEGAS QUANT · THE ZONE</span><span className="win-badge">✓ WIN · {legs.length}/{legs.length}</span></header>
    <p className="eyebrow">LONDON · OCT 11, 2026 · {live ? "LIVE FULL-GAME PICKS" : "FIRST QUARTER"}</p>
    <h2>{live ? "Six legs. One $500 win." : "Five legs. One winning slip."}</h2>
    <p>Philadelphia Eagles @ Jacksonville Jaguars{live ? " · Final: PHI 17 — JAX 19" : ""}</p>
    <div className="win-price">
      <div><small>{live ? "TOTAL PAYOUT" : "COMBINED ODDS"}</small><strong>{live ? "$500.00" : "+1353"}</strong></div>
      <div>{live ? <><span className="win-badge">+$450.00 profit</span><small>$50.00 stake · Combined +900</small></> : <><span className="win-badge">30% profit boost</span><small>Base odds +1041</small></>}</div>
    </div>
    <ol>{legs.map(([name, selection]) => <li key={name}><TeamHelmet name={name} /><div><strong>{name}</strong><span>{selection}</span><small>{live ? "Full-game total · live selection" : "1st quarter"}</small></div><span className="win-leg-status" aria-label="Leg won">✓</span></li>)}</ol>
    <footer><strong>ALL {live ? "SIX" : "FIVE"} LEGS CLEARED</strong><time dateTime={publishedAt}>{time(publishedAt)}</time></footer>
    {live && <p><small>DraftKings · Settled ticket · Total payout includes the $50 stake.</small></p>}
  </article>;
}
