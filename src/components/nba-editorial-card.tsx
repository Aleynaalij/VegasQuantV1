"use client";
import Link from "next/link";
import { time } from "@/lib/domain";
import {
  nbaEditorialCopy,
  nbaEditorialMarket,
  nbaEditorialOpen,
  nbaEditorialSources,
  type NbaEditorialPick,
} from "@/lib/nba-editorial";
import CasinoCard, { CasinoCardDownload } from "./casino-card";
import type { CasinoCardData } from "@/lib/casino-card";
import GamblyLink from "./gambly-link";
import "@/app/nba-editorial.css";

/** The immutable publication card, shared by the feed and game pages. */
export default function NbaEditorialCard({
  pick: p,
  now,
  superseded = false,
  enabled = true,
}: {
  pick: NbaEditorialPick;
  now: number;
  superseded?: boolean;
  enabled?: boolean;
}) {
  const open = enabled && nbaEditorialOpen(p, now, superseded);
  const face: CasinoCardData = {
    variant: "pick",
    eyebrow: "NBA · Analyst selection",
    title: p.player,
    market: nbaEditorialMarket(p),
    matchup: p.game
      ? `${p.game.away_team} @ ${p.game.home_team} · ${time(p.game.tipoff)}`
      : "NBA matchup",
    price: `${p.book} ${p.odds > 0 ? "+" : ""}${p.odds} · observed`,
    footnote: "Qualitative selection · No validated edge claimed",
    publishedAt: p.published_at,
  };
  return (
    <section key={p.id} id={`pick-${p.id}`} className="nba-editorial-pick">
      <CasinoCard data={face} />
      <p className="nba-editorial-quote">
        Quote: {time(p.quote_observed_at)} · Full game
      </p>
      <p>
        <strong>The case:</strong> {p.rationale}
      </p>
      <p>
        <strong>Why it could lose:</strong> {p.risk}
      </p>
      {open ? (
        <GamblyLink
          url="https://gambly.com/"
          selection={nbaEditorialCopy(p)}
          kalshiTexts={nbaEditorialCopy(p).split("\n").filter(Boolean)}
          beforeOpen={async () => nbaEditorialOpen(p, Date.now(), superseded)}
        />
      ) : (
        <p className="notice">
          {superseded
            ? "Updated selection below or above; original preserved."
            : "Pregame copying closed. Original selection preserved."}
        </p>
      )}
      <details>
        <summary>Sources & availability</summary>
        <p>{p.unknowns}</p>
        <p>
          FanDuel provider quote {time(p.quote_observed_at)}; received{" "}
          {time(p.quote_recorded_at)}. This is the recorded publication price,
          not a live executable quote.
        </p>
        <p>
          Analyst judgment. No model probability, EV, confidence score or
          official-pick status is assigned.
        </p>
        <ul>
          {nbaEditorialSources(p).map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label} ↗
              </a>
            </li>
          ))}
        </ul>
        <a href={p.quote_source_url} target="_blank" rel="noopener noreferrer">
          FanDuel-attributed provider snapshot source ↗
        </a>
        {p.game && (
          <p>
            <Link href={`/nba/games/${p.game.slug}`}>
              Matchup & latest markets →
            </Link>
          </p>
        )}
      </details>
      <CasinoCardDownload data={face} />
    </section>
  );
}
