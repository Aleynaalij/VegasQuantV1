import BrandMark from "./brand-mark";
import TeamHelmet from "./team-helmet";
import { time } from "@/lib/domain";
const legs = [
  ["Bhayshul Tuten", "10+ rushing yards"],
  ["Trevor Lawrence", "40+ passing yards"],
  ["Brenton Strange", "Over 3.5 receiving yards"],
  ["Dallas Goedert", "Over 3.5 receiving yards"],
  ["Jalen Hurts", "Under 33.5 passing yards"],
];
export default function LondonWinningSlip({ publishedAt }: { publishedAt: string }) {
  return <article className="zone-winning-slip" aria-label="Winning combined five-leg first-quarter parlay">
    <header><span className="win-brand"><BrandMark /> VEGAS QUANT · THE ZONE</span><span className="win-badge">✓ WIN · 5/5</span></header>
    <p className="eyebrow">LONDON · OCT 11, 2026 · FIRST QUARTER</p>
    <h2>Five legs. One winning slip.</h2>
    <p>Philadelphia Eagles @ Jacksonville Jaguars</p>
    <div className="win-price"><div><small>COMBINED ODDS</small><strong>+1353</strong></div><div><span className="win-badge">30% profit boost</span><small>Base odds +1041</small></div></div>
    <ol>{legs.map(([name, selection]) => <li key={name}><TeamHelmet name={name} /><div><strong>{name}</strong><span>{selection}</span><small>1st quarter</small></div><span className="win-leg-status" aria-label="Leg won">✓</span></li>)}</ol>
    <footer><strong>ALL FIVE LEGS CLEARED</strong><time dateTime={publishedAt}>{time(publishedAt)}</time></footer>
  </article>;
}
