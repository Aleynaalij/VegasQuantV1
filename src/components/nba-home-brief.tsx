"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  BookMarked,
  CalendarDays,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  nbaHomeSlate,
  nbaIsLive,
  nbaNickname,
  nbaWhen,
  type NbaHomeGame,
} from "@/lib/nba-home";
import NbaTeamLogo from "./nba-team-logo";
import KickoffCountdown from "./kickoff-countdown";

/** Regular season opens October 20, 2026 (midnight ET); shown until the schedule loads or if it cannot. */
const OPENING_NIGHT = "2026-10-20T04:00:00Z";
const COLUMNS =
  "id,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season_type,status,away_score,home_score";

/** The NBA home hero: the next (or live) regular-season game, like the NFL "Next kickoff" card. */
export default function NbaHomeBrief() {
  const [games, setGames] = useState<NbaHomeGame[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let live = true;
    async function load() {
      const at = Date.now();
      const { data, error } = await supabase
        .from("nba_games")
        .select(COLUMNS)
        .eq("season_type", 2)
        .gte("tipoff", new Date(at - 4 * 3600000).toISOString())
        .lte("tipoff", new Date(at + 8 * 86400000).toISOString())
        .order("tipoff")
        .limit(60);
      if (!live) return;
      // A failed read keeps the last good slate; the first failure falls back to the generic hero.
      if (!error && data) setGames(data as NbaHomeGame[]);
      else setGames((g) => g ?? []);
      setNow(at);
    }
    load();
    const t = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  const { next, rest, week, opening } = nbaHomeSlate(games || [], now);
  const isLive = next ? nbaIsLive(next, now) : false;
  return (
    <header className="home-brief vq-home nba-home-brief">
      <section
        className="vq-hero"
        aria-labelledby="nba-hero-title"
        aria-busy={games === null}
      >
        <div className="vq-hero-top">
          <span className="vq-kicker">
            <i aria-hidden="true" />{" "}
            {isLive
              ? "Live now"
              : next
                ? opening
                  ? "Opening night"
                  : "Next tip-off"
                : "The basketball desk"}
          </span>
          <span className="vq-chip">NBA</span>
        </div>
        {next ? (
          <>
            <h1 id="nba-hero-title" className="vq-sr">
              {isLive ? "Live" : "Next tip-off"}: {next.away_team} at{" "}
              {next.home_team}
            </h1>
            <a className="vq-matchup" href="#nba-slate">
              <span className="vq-team">
                <NbaTeamLogo
                  team={next.away_team}
                  abbreviation={next.away_abbreviation}
                  size={64}
                />
                <b>{nbaNickname(next.away_team)}</b>
                {isLive && next.away_score !== null ? (
                  <strong className="nba-hero-score">{next.away_score}</strong>
                ) : null}
              </span>
              <span className="vq-at" aria-hidden="true">
                @
              </span>
              <span className="vq-team">
                <NbaTeamLogo
                  team={next.home_team}
                  abbreviation={next.home_abbreviation}
                  size={64}
                />
                <b>{nbaNickname(next.home_team)}</b>
                {isLive && next.home_score !== null ? (
                  <strong className="nba-hero-score">{next.home_score}</strong>
                ) : null}
              </span>
            </a>
            <div className="vq-hero-meta">
              <span>
                {next.tipoff_tbd
                  ? `${nbaWhen(next.tipoff, { weekday: "short", month: "short", day: "numeric" })} · Time TBD`
                  : `${nbaWhen(next.tipoff, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}
                {next.venue ? ` · ${next.venue}` : ""}
              </span>
              <KickoffCountdown
                kickoff={next.tipoff}
                label="Time to tip-off"
                liveLabel="Tipped off"
              />
            </div>
            <div className="vq-hero-actions">
              <a className="vq-btn" href="#nba-slate">
                Scores & schedule <ArrowDown size={16} aria-hidden="true" />
              </a>
              <Link className="vq-btn ghost" href="/nba/rules">
                The rulebook
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 id="nba-hero-title" className="vq-hero-title">
              The NBA is back.
              <br />
              <em>Opening night, Oct 20.</em>
            </h1>
            <div className="vq-hero-meta">
              <span>Regular season · Tuesday, October 20</span>
              <KickoffCountdown
                kickoff={OPENING_NIGHT}
                label="Time to opening night"
                liveLabel="Season underway"
              />
            </div>
          </>
        )}
      </section>
      {rest.length > 0 && (
        <nav className="vq-slate" aria-label="Upcoming NBA games">
          {rest.map((g) => (
            <a key={g.id} href="#nba-slate">
              <span className="vq-slate-teams">
                <NbaTeamLogo
                  team={g.away_team}
                  abbreviation={g.away_abbreviation}
                  size={26}
                />
                <b>{nbaNickname(g.away_team)}</b>
                <small>@</small>
                <NbaTeamLogo
                  team={g.home_team}
                  abbreviation={g.home_abbreviation}
                  size={26}
                />
                <b>{nbaNickname(g.home_team)}</b>
              </span>
              <time dateTime={g.tipoff}>
                {nbaIsLive(g, now)
                  ? "Live"
                  : nbaWhen(g.tipoff, {
                      weekday: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
              </time>
            </a>
          ))}
        </nav>
      )}
      <nav className="vq-tiles" aria-label="Basketball desk shortcuts">
        <a href="#nba-slate">
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <b>{games === null ? "Schedule" : `${week} games`}</b>
            <small>Next 7 days</small>
          </span>
        </a>
        <Link href="/nba/zone">
          <Radio size={18} aria-hidden="true" />
          <span>
            <b>The NBA Zone</b>
            <small>Basketball feed</small>
          </span>
        </Link>
        <Link href="/nba/rules">
          <BookMarked size={18} aria-hidden="true" />
          <span>
            <b>The rulebook</b>
            <small>40 rules behind every play</small>
          </span>
        </Link>
      </nav>
      <p className="nba-home-note">
        <ShieldCheck size={16} aria-hidden="true" /> Preparation mode: no NBA
        picks are published until the regular season starts and the research is
        ready.
      </p>
    </header>
  );
}
