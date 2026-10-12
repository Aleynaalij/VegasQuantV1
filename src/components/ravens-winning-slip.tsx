import BrandMark from "./brand-mark";
import TeamHelmet from "./team-helmet";
import { time } from "@/lib/domain";

const legs = [
  ["Bijan Robinson", "70+ rushing yards"],
  ["Drake London", "50+ receiving yards"],
  ["Michael Penix Jr.", "150+ passing yards"],
  ["Derrick Henry", "40+ rushing yards"],
  ["Mark Andrews", "15+ receiving yards"],
] as const;

/** Retrospective owner-supplied ticket recap; does not grade challenge records. */
export default function RavensWinningSlip({ publishedAt }: { publishedAt: string }) {
  return (
    <article className="zone-winning-slip" aria-label="Winning Ravens–Falcons five-leg parlay with $218 total payout">
      <header>
        <span className="win-brand"><BrandMark /> VEGAS QUANT · THE ZONE</span>
        <span className="win-badge">✓ WIN · 5/5</span>
      </header>
      <p className="eyebrow">SUNDAY NIGHT · OCT 11, 2026 · FULL GAME</p>
      <h2>Five legs. One $218 win.</h2>
      <p>Baltimore Ravens @ Atlanta Falcons · Final: BAL 30 — ATL 23 (OT)</p>
      <div className="win-price">
        <div><small>TOTAL PAYOUT</small><strong>$218.00</strong></div>
        <div>
          <span className="win-badge">+$118.00 net profit</span>
          <small>$100.00 stake · Combined +118</small>
        </div>
      </div>
      <ol>
        {legs.map(([name, selection]) => (
          <li key={name}>
            <TeamHelmet name={name} />
            <div><strong>{name}</strong><span>{selection}</span><small>Full-game total</small></div>
            <span className="win-leg-status" aria-label="Leg won">✓</span>
          </li>
        ))}
      </ol>
      <footer>
        <strong>ALL FIVE LEGS CLEARED</strong>
        <time dateTime={publishedAt}>{time(publishedAt)}</time>
      </footer>
      <p><small>DraftKings · Owner-submitted settled ticket. Total payout includes the $100 stake.</small></p>
    </article>
  );
}
