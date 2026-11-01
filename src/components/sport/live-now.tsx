"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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

type Ours = { picked: Set<string>; hrefs: Map<string, string> };
const NONE: Ours = { picked: new Set(), hrefs: new Map() };

/**
 * Our record of the games on the strip, by ESPN id (the provider id NBA, NHL and college games are
 * stored under): which ones carry a published pick, and the NBA matchup link. Home only loads
 * upcoming games and unexpired picks, and picks expire at the start, so live games are looked up
 * here. Picks are member reads: others simply see no flag.
 */
async function lookup(sport: LiveSport, ids: string[]): Promise<Ours> {
  if (sport === "nfl" || !ids.length) return NONE;
  const out: Ours = { picked: new Set(), hrefs: new Map() };
  for (let i = 0; i < ids.length; i += 100) {
    const part = ids.slice(i, i + 100);
    const r =
      sport === "nba"
        ? await supabase
            .from("nba_games")
            .select("provider_id,slug,picks:nba_editorial_picks(id)")
            .in("provider_id", part)
        : await supabase
            .from("sports_games")
            .select("provider_id,picks:sports_selections(id)")
            .eq("sport", sport)
            .in("provider_id", part);
    if (r.error) return out;
    for (const row of (r.data || []) as {
      provider_id: string;
      slug?: string | null;
      picks?: unknown[] | null;
    }[]) {
      if (row.picks?.length) out.picked.add(row.provider_id);
      if (row.slug)
        out.hrefs.set(
          row.provider_id,
          `/nba/games/${encodeURIComponent(row.slug)}`,
        );
    }
  }
  return out;
}

/**
 * Live game day: games in progress with score, period and clock, then today's finals. Refreshes
 * every 30 seconds while the tab is visible. Shows nothing when no game is live or recently final.
 */
export default function LiveNow({
  sport,
  ours = [],
}: {
  sport: LiveSport;
  /** NFL's slate, to link a live game to its matchup. */
  ours?: OurGame[];
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
  const [known, setKnown] = useState<Ours>(NONE);
  const shown = games
    .filter((g) => g.state !== "pre")
    .map((g) => g.id)
    .sort()
    .join(",");
  useEffect(() => {
    let live = true;
    void lookup(sport, shown ? shown.split(",") : []).then((o) => {
      if (live) setKnown(o);
    });
    return () => {
      live = false;
    };
  }, [sport, shown]);
  const isPicked = (g: LiveGame) => known.picked.has(g.id);
  const { live, finals, more } = liveStrip(games, clock, 12, isPicked);
  if (!live.length && !finals.length) return null;
  const href = (g: LiveGame) =>
    sport === "nhl" || sport === "ncaab"
      ? sportGameHref(sport, g)
      : sport === "nba"
        ? known.hrefs.get(g.id) || null
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
