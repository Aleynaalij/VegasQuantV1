import BrandMark from "./brand-mark";
import DownloadCard from "./download-card";
import { time } from "@/lib/domain";
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
  const won = d.result === "WIN";
  const title = `${d.player} · ${d.result}`;
  return (
    <div>
      <article
        className={`zone-winning-slip ${d.result === "LOSS" ? "result-miss" : ""}`}
        aria-label={title}
      >
        <header>
          <span className="win-brand">
            <BrandMark /> VEGAS QUANT · THE ZONE
          </span>
          <span className="win-badge">
            {won ? "✓ HIT" : d.result === "PUSH" ? "— PUSH" : "✕ MISS"}
          </span>
        </header>
        <p className="eyebrow">
          VERIFIED EDITORIAL RESULT · FULL GAME / INCLUDES OT
        </p>
        <h2>{title}</h2>
        <p>{matchup}</p>
        <div className="win-price">
          <div>
            <small>FINAL {d.metric.replace(/_/g, " ").toUpperCase()}</small>
            <strong>{d.value}</strong>
          </div>
          <div>
            <strong>{d.market}</strong>
            <small>Original published selection</small>
          </div>
        </div>
        <p>
          ESPN final box score corroborated by nflverse weekly player stats.
          This is the published leg’s result; it does not confirm a wager or
          payout.
        </p>
        <p>
          <a href={d.espn_url} target="_blank" rel="noopener noreferrer">
            Final box score ↗
          </a>{" "}
          ·{" "}
          <a href={d.nflverse_url} target="_blank" rel="noopener noreferrer">
            Weekly stats ↗
          </a>
        </p>
        <footer>
          <strong>
            {won
              ? "PUBLISHED TARGET CLEARED"
              : "EVERY OUTCOME STAYS IN THE RECORD"}
          </strong>
          <time dateTime={publishedAt}>{time(publishedAt)}</time>
        </footer>
      </article>
      <DownloadCard
        title={title}
        subtitle={matchup}
        publishedAt={publishedAt}
        sections={[
          { heading: "Original selection", text: d.market },
          {
            heading: "Verified final",
            text: `${d.value} ${d.metric.replace(/_/g, " ")} · ${d.result}`,
          },
          {
            heading: "Transparency",
            text: "Editorial stat result. Includes overtime. No stake, payout or profit assumed. Provider corrections may require review.",
          },
          { heading: "Sources", text: `${d.espn_url}\n${d.nflverse_url}` },
        ]}
      />
    </div>
  );
}
