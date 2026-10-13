import BrandMark from "./brand-mark";
import TeamHelmet from "./team-helmet";
import DownloadCard from "./download-card";
import { time } from "@/lib/domain";

const pregame = [
  ["Puka Nacua", "60+ receiving yards", "138 receiving yards"],
  ["James Cook", "50+ rushing yards", "111 rushing yards"],
  ["Kyren Williams", "40+ rushing yards", "49 rushing yards"],
  ["Matthew Stafford", "220+ passing yards", "383 passing yards"],
  ["Josh Allen", "200+ passing yards", "210 passing yards"],
];
const live = [
  ["James Cook", "70+ rushing yards", "111 rushing yards"],
  ["Kyren Williams", "40+ rushing yards", "49 rushing yards"],
  ["Josh Allen", "25+ rushing yards", "121 rushing yards"],
  ["Puka Nacua", "60+ receiving yards", "138 receiving yards"],
  ["Davante Adams", "30+ receiving yards", "51 receiving yards"],
  ["Tyler Higbee", "20+ receiving yards", "83 receiving yards"],
];

export default function BillsWinningSlip({ publishedAt, halftime = false }: { publishedAt: string; halftime?: boolean }) {
  const legs = halftime ? live : pregame;
  const title = halftime ? "Six halftime legs. Six hits." : "Five legs. One $531.92 win.";
  const note = halftime
    ? "Verified results of the six published halftime selections. Settled wager, stake, combined odds and payout were not supplied. Full-game totals include overtime."
    : "DraftKings · Owner-submitted settled ticket. $531.92 total payout includes the $218 stake. Original ticket: Stafford 220+.";
  return <div>
    <article className="zone-winning-slip" aria-label={title}>
      <header>
        <span className="win-brand"><BrandMark /> VEGAS QUANT · THE ZONE</span>
        <span className="win-badge">✓ {halftime ? "HIT · 6/6" : "WIN · 5/5"}</span>
      </header>
      <p className="eyebrow">MONDAY NIGHT · OCT 12, 2026 · {halftime ? "HALFTIME SELECTIONS" : "FULL GAME"}</p>
      <h2>{title}</h2>
      <p>Buffalo Bills @ Los Angeles Rams · Final: BUF 37 — LAR 34 (OT)</p>
      <div className="win-price">
        <div><small>{halftime ? "PUBLISHED LEGS CLEARED" : "TOTAL PAYOUT"}</small><strong>{halftime ? "6 / 6" : "$531.92"}</strong></div>
        <div><span className="win-badge">{halftime ? "✓ All six hit" : "+$313.92 net profit"}</span><small>{halftime ? "Stake & payout not supplied" : "$218.00 stake · Combined +144"}</small></div>
      </div>
      <ol>{legs.map(([name, selection, final]) => <li key={name}>
        <TeamHelmet name={name} />
        <div><strong>{name}</strong><span>{selection}</span><small>Full-game total · Final: {final}</small></div>
        <span className="win-leg-status" aria-label="Leg won">✓</span>
      </li>)}</ol>
      <footer><strong>ALL {halftime ? "SIX" : "FIVE"} LEGS CLEARED</strong><time dateTime={publishedAt}>{time(publishedAt)}</time></footer>
      <p><small>{note}</small></p>
    </article>
    <DownloadCard title={title} subtitle="BUF 37 — LAR 34 (OT) · October 12, 2026" publishedAt={publishedAt} sections={[
      { heading: "Result", text: halftime ? "6/6 published halftime legs hit. Stake and payout not supplied." : "$218 stake · Combined +144 · $531.92 total payout · $313.92 net profit" },
      { heading: "Winning legs", text: legs.map(([name, selection, final]) => `✓ ${name} ${selection} · Final: ${final}`).join("\n") },
      { heading: "Record", text: note },
    ]} />
  </div>;
}
