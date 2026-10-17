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
  nbaAwaiting,
  nbaHomeSlate,
  nbaIsLive,
  nbaNickname,
  nbaWhen,
  type NbaHomeGame,
} from "@/lib/nba-home";
import NbaTeamLogo from "./nba-team-logo";
import KickoffCountdown from "./kickoff-countdown";

/** Regular season opens October 20, 2026 (midnight ET); the pre-season hero counts down to it. */
const OPENING_NIGHT = "2026-10-20T04:00:00Z";
/** After opening night (midnight ET, Oct 21) an empty slate is never presented as "opening night". */
const AFTER_OPENING_NIGHT = Date.parse("2026-10-21T04:00:00Z");
const COLUMNS =
  "id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season_type,status,away_score,home_score";

/** The NBA home hero: the next (or live) regular-season game, like the NFL "Next kickoff" card. */
export default function NbaHomeBrief({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [games, setGames] = useState<NbaHomeGame[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // When the last read failed; the last good slate (and when it loaded) stays on screen with a notice.
  const [failed, setFailed] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
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
      if (!error && data) {
        setGames(data as NbaHomeGame[]);
        setLoadedAt(at);
        setFailed(false);
      } else {
        setGames((g) => g ?? []);
        setFailed(true);
      }
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
  const awaiting = next ? nbaAwaiting(next, now) : false;
  const unavailable = failed && loadedAt === null;
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
              : awaiting
                ? "Awaiting game update"
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
              {isLive
                ? "Live"
                : awaiting
                  ? "Awaiting game update"
                  : "Next tip-off"}
              : {next.away_team} at {next.home_team}
            </h1>
            <Link
              className="vq-matchup"
              href={
                next.slug
                  ? `/nba/games/${encodeURIComponent(next.slug)}`
                  : "#nba-slate"
              }
            >
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
            </Link>
            <div className="vq-hero-meta">
              <span>
                {next.tipoff_tbd
                  ? `${nbaWhen(next.tipoff, { weekday: "short", month: "short", day: "numeric" })} · Time TBD`
                  : `${nbaWhen(next.tipoff, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET`}
                {next.venue ? ` · ${next.venue}` : ""}
              </span>
              {isLive ? (
                <span className="vq-countdown live">
                  <i aria-hidden="true" /> In play
                </span>
              ) : awaiting ? (
                <span className="vq-countdown">Awaiting game update</span>
              ) : next.tipoff_tbd ? null : (
                <KickoffCountdown
                  kickoff={next.tipoff}
                  label="Time to tip-off"
                  liveLabel="Awaiting game update"
                />
              )}
            </div>
            <div className="vq-hero-actions">
              <a className="vq-btn" href="#nba-slate">
                Scores & schedule <ArrowDown size={16} aria-hidden="true" />
              </a>
              {!compact && (
                <Link className="vq-btn ghost" href="/nba/rules">
                  The rulebook
                </Link>
              )}
            </div>
          </>
        ) : unavailable ? (
          <>
            <h1 id="nba-hero-title" className="vq-hero-title">
              Schedule unavailable.
            </h1>
            <p className="vq-hero-sub">
              We couldn’t load the NBA schedule. It retries automatically.
            </p>
          </>
        ) : games !== null && now >= AFTER_OPENING_NIGHT ? (
          <>
            <h1 id="nba-hero-title" className="vq-hero-title">
              No NBA games this week.
            </h1>
            <p className="vq-hero-sub">
              The next regular-season games will appear here once they are
              scheduled.
            </p>
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
      {failed && loadedAt !== null ? (
        <p className="nba-home-stale" role="status">
          Couldn’t refresh the schedule · showing games as of{" "}
          {nbaWhen(new Date(loadedAt).toISOString(), {
            hour: "numeric",
            minute: "2-digit",
          })}{" "}
          ET
        </p>
      ) : null}
      {!compact && rest.length > 0 && (
        <nav className="vq-slate" aria-label="Upcoming NBA games">
          {rest.map((g) => (
            <Link
              key={g.id}
              href={
                g.slug
                  ? `/nba/games/${encodeURIComponent(g.slug)}`
                  : "#nba-slate"
              }
            >
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
                  : nbaAwaiting(g, now)
                    ? "Awaiting update"
                    : g.tipoff_tbd
                      ? `${nbaWhen(g.tipoff, { weekday: "short" })} · TBD`
                      : nbaWhen(g.tipoff, {
                          weekday: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
              </time>
            </Link>
          ))}
        </nav>
      )}
      {!compact && (
        <nav className="vq-tiles" aria-label="Basketball desk shortcuts">
          <a href="#nba-slate">
            <CalendarDays size={18} aria-hidden="true" />
            <span>
              <b>
                {games === null || unavailable ? "Schedule" : `${week} games`}
              </b>
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
      )}
      <p className="nba-home-note">
        <ShieldCheck size={16} aria-hidden="true" /> Preparation mode: no NBA
        picks are published until the regular season starts and the research is
        ready.
      </p>
    </header>
  );
}
