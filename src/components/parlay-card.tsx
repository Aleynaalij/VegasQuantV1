"use client";
import Link from "next/link";
import BrandMark from "./brand-mark";
import LegActions from "./leg-actions";
import GamblyLink from "./gambly-link";
import DownloadCard from "./download-card";
export type ParlayCandidate = {
  worth_a_dollar?: boolean;
  name: string;
  market: string;
  matchup: string;
  why: string;
  risk: string;
  next: string;
  copy_text: string;
  gambly_url: string;
  parlay_legs: { name: string; market: string; why: string; risk: string; matchup?: string }[];
  sources: { label: string; url: string }[];
  original_leg_key?: string;
};
export default function ParlayCard({
  candidate: c,
  releaseId,
  publishedAt,
  expiresAt,
}: {
  candidate: ParlayCandidate;
  releaseId: string;
  publishedAt: string;
  expiresAt: string;
}) {
  const key = c.original_leg_key || `candidate:${releaseId}:1`;
  return (
    <article className="zone-winning-slip">
      <header>
        <span className="win-brand">
          <BrandMark /> VEGAS QUANT · THE ZONE
        </span>
        <span className="win-badge">{c.parlay_legs.length} LEG PARLAY</span>
      </header>
      <h2>{c.name}</h2>
      <p>{c.matchup}</p>
      <p className="notice">
        <strong>Availability check required</strong> · {c.risk}
      </p>
      <ol>
        {c.parlay_legs.map((l) => (
          <li key={l.name}>
            <div>
              <strong>{l.name}</strong>
              <span>{l.market}</span>
              {c.worth_a_dollar && <small>{l.matchup}</small>}
              {!c.worth_a_dollar && <small>{l.why}</small>}
            </div>
          </li>
        ))}
      </ol>
      {!c.worth_a_dollar && (
        <p>
          <strong>Odds unavailable.</strong> These are analyst-selected
          full-game targets. No verified FanDuel lines, combined price or payout
          is supplied.
        </p>
      )}
      {c.worth_a_dollar ? (
        <p>
          Ten sleepers. Ten games. One dollar, see what happens. Just for fun ·
          every leg must clear. Analyst-selected targets; market availability
          must be checked at your sportsbook.
        </p>
      ) : (
        <p>{c.why}</p>
      )}
      {!c.worth_a_dollar && (
        <p>
          <Link href="/games/sea-den-2026-2-6">
            Latest matchup analysis and injury updates →
          </Link>
        </p>
      )}
      <p>
        <strong>Next update:</strong> {c.next}
      </p>
      <LegActions
        legKey={key}
        parlay
        expired={Date.now() >= Date.parse(expiresAt)}
      />
      <p>
        <Link href="/">See your tailed parlays on Home →</Link>
      </p>
      <GamblyLink
        url={c.gambly_url}
        selection={c.parlay_legs.map((leg) => `${leg.name} ${leg.market.replace(/^Full game\s*[·:—-]\s*/i, "")}`).join("\n")}
        label="Copy parlay & open Gambly ↗"
      />
      <details>
        <summary>
          {c.worth_a_dollar
            ? "The logic, risks & sources"
            : "Every leg’s risk and source links"}
        </summary>
        {c.worth_a_dollar && <p>{c.why}</p>}
        {c.parlay_legs.map((l) => (
          <p key={l.name}>
            <strong>{l.name}:</strong> {c.worth_a_dollar && <>{l.why} </>}
            {l.risk}
          </p>
        ))}
        {c.sources.map((s) => (
          <p key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer">
              {s.label} ↗
            </a>
          </p>
        ))}
      </details>
      <DownloadCard
        title={c.name}
        subtitle={c.matchup}
        publishedAt={publishedAt}
        sections={[
          { heading: `${c.parlay_legs.length} targets`, text: c.copy_text },
          { heading: "Availability & correlation", text: c.risk + " " + c.why },
          { heading: "Next update", text: c.next },
          {
            heading: "Sources",
            text: c.sources.map((s) => s.label + ": " + s.url).join("\n"),
          },
        ]}
      />
    </article>
  );
}
