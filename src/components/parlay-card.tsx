"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import LegActions from "./leg-actions";
import GamblyLink from "./gambly-link";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import { cleanMarket, type CasinoCardData } from "@/lib/casino-card";
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
  parlay_legs: {
    name: string;
    market: string;
    why: string;
    risk: string;
    matchup?: string;
  }[];
  sources: { label: string; url: string }[];
  original_leg_key?: string;
  // The validated leaves this bundle references (candidate:<release>:<n>), one per parlay leg.
  leg_keys?: string[];
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
  const [deadlineReached, setDeadlineReached] = useState(false);
  useEffect(() => {
    setDeadlineReached(false);
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      setDeadlineReached(true);
      return;
    }
    const timer = setTimeout(() => setDeadlineReached(true), remaining);
    return () => clearTimeout(timer);
  }, [expiresAt]);
  const expired =
    deadlineReached ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.now() >= Date.parse(expiresAt);
  const key = c.original_leg_key || `candidate:${releaseId}:1`;
  const card: CasinoCardData = {
    variant: "parlay",
    eyebrow: `${c.parlay_legs.length}-leg parlay · every leg must hit`,
    title: c.name,
    matchup: c.matchup,
    price: c.worth_a_dollar
      ? "$1 for fun · odds at your book"
      : "Analyst targets · combined odds unverified",
    legs: c.parlay_legs.map((l) => ({
      name: l.name,
      market: cleanMarket(l.market),
      note: c.worth_a_dollar ? l.matchup?.split(" · ")[0] : undefined,
    })),
    publishedAt,
  };
  return (
    <section className="vq-parlay" id={`parlay-${releaseId}`}>
      <CasinoCard data={card} />
      <p className="notice">
        <strong>Availability check required</strong> · {c.risk}
      </p>
      {!c.worth_a_dollar && (
        <p>
          <strong>Odds unavailable.</strong> These are analyst-selected
          full-game targets. No verified FanDuel lines, combined price or payout
          is supplied.
        </p>
      )}
      {c.worth_a_dollar ? (
        <p>
          {c.parlay_legs.length} sleepers. {c.parlay_legs.length} games. One
          dollar, see what happens. Just for fun · every leg must clear.
          Analyst-selected targets; market availability must be checked at your
          sportsbook.
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
      <LegActions legKey={key} parlay expired={expired} />
      <p>
        <Link href="/">See your tailed parlays on Home →</Link>
      </p>
      <GamblyLink
        url={c.gambly_url}
        selection={c.parlay_legs
          .map(
            (leg) =>
              `${leg.name} ${leg.market.replace(/^Full game\s*[·:—-]\s*/i, "")}`,
          )
          .join("\n")}
        label="Copy parlay & open Gambly ↗"
        // Published leaves keep their game, so Kalshi checks that exact game; text matching is only
        // for older bundles without leaf keys.
        {...(c.leg_keys?.length === c.parlay_legs.length
          ? { kalshiLegKeys: c.leg_keys }
          : {
              kalshiTexts: c.parlay_legs.map(
                (leg) =>
                  `${leg.name} ${leg.market.replace(/^Full game\s*[·:—-]\s*/i, "")}`,
              ),
            })}
        disabled={expired}
      />
      <details>
        <summary>
          {c.worth_a_dollar
            ? "The logic, risks & sources"
            : "Why each leg, risks & sources"}
        </summary>
        {c.worth_a_dollar && <p>{c.why}</p>}
        {c.parlay_legs.map((l) => (
          <p key={l.name}>
            <strong>{l.name}:</strong> {l.why} {l.risk}
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
      <CasinoCardDownload data={card} />
    </section>
  );
}
