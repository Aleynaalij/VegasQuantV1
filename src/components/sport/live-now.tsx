"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  liveStrip,
  sameGame,
  sportGameHref,
  type LiveGame,
  type LiveSport,
} from "@/lib/live-scores";

export type OurGame = {
  away: string;
  home: string;
  start: string;
  href?: string | null;
};

/**
 * Live game day: games in progress with score, period and clock, then today's finals. Refreshes
 * every 30 seconds while the tab is visible. Shows nothing when no game is live or recently final.
 */
export default function LiveNow({
  sport,
  ours = [],
  picked = [],
}: {
  sport: LiveSport;
  /** Our slate, to link a live game to its matchup (NFL and NBA). */
  ours?: OurGame[];
  /** Games members have a published pick on, kept first. */
  picked?: OurGame[];
}) {
  const [games, setGames] = useState<LiveGame[]>([]),
    [stale, setStale] = useState(false),
    [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const r = await fetch(`/api/live?sport=${sport}`);
        const d = await r.json();
        if (!live) return;
        if (!r.ok || !Array.isArray(d.games)) throw Error();
        setGames(d.games);
        setStale(false);
      } catch {
        if (live) setStale(true);
      }
      if (live) setClock(Date.now());
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30000);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [sport]);
  const isPicked = (g: LiveGame) => picked.some((o) => sameGame(g, o));
  const { live, finals, more } = liveStrip(games, clock, 12, isPicked);
  if (!live.length && !finals.length) return null;
  const href = (g: LiveGame) =>
    sport === "nhl" || sport === "ncaab"
      ? sportGameHref(sport, g)
      : ours.find((o) => sameGame(g, o))?.href || null;
  const card = (g: LiveGame) => {
    const to = href(g);
    const lead =
      g.away.score !== null && g.home.score !== null
        ? g.away.score > g.home.score
          ? "away"
          : g.home.score > g.away.score
            ? "home"
            : null
        : null;
    const body = (
      <>
        <span className="live-now-status">
          {g.state === "in" ? <b className="live-now-dot">LIVE</b> : null}
          {g.detail || (g.state === "post" ? "Final" : "")}
        </span>
        {(["away", "home"] as const).map((side) => (
          <span
            key={side}
            className={`live-now-team${lead === side ? " is-leading" : ""}`}
          >
            <span>{g[side].abbreviation}</span>
            <strong>{g[side].score ?? "–"}</strong>
          </span>
        ))}
        {isPicked(g) ? (
          <i className="live-now-pick">Our pick on this game</i>
        ) : null}
      </>
    );
    return (
      <li key={g.id} className={`live-now-game is-${g.state}`}>
        {to ? (
          <Link
            href={to}
            aria-label={`${g.away.name} ${g.away.score ?? ""}, ${g.home.name} ${g.home.score ?? ""}, ${g.detail}. Open the matchup`}
          >
            {body}
          </Link>
        ) : (
          <div>{body}</div>
        )}
      </li>
    );
  };
  return (
    <section className="live-now" aria-label="Live scores">
      <h2 className="live-now-title">
        {live.length ? "Live now" : "Today’s finals"}
      </h2>
      <ul className="live-now-list">
        {live.map(card)}
        {finals.map(card)}
      </ul>
      <p className="live-now-note">
        {more ? `${more} more games live. ` : ""}
        ESPN scores, refreshed every 30 seconds
        {stale ? "; the last refresh failed, so scores may be behind" : ""}.
      </p>
    </section>
  );
}
