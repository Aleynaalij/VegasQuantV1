import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SPORTS, type Sport } from "@/lib/sports";
import { easternTime, upcomingSlate, type SlateGame } from "@/lib/sport-slate";
import KickoffCountdown from "../kickoff-countdown";
import SportLogo from "./sport-logo";

/** Home's lead card for any sport: the next game, its countdown and the way into the slate. */
export default function SportBrief({
  sport,
  games,
  action,
  emptyTitle,
}: {
  sport: Sport;
  games: SlateGame[];
  /** Primary button text, e.g. "Choose player props" or "See the lines". */
  action: string;
  emptyTitle?: string;
}) {
  const info = SPORTS[sport];
  const upcoming = upcomingSlate(games);
  const next = upcoming[0];
  const team = (side: "away" | "home") => (
    <span className="vq-team">
      <SportLogo
        sport={sport}
        team={next[side].name}
        abbreviation={next[side].abbreviation}
        espnId={next[side].espnId}
        size={64}
      />
      <b>{next[side].short}</b>
    </span>
  );
  return (
    <header className="home-brief vq-home" data-sport={sport}>
      <section className="vq-hero" aria-labelledby="vq-hero-title">
        <div className="vq-hero-top">
          <span className="vq-kicker">
            <i aria-hidden="true" />{" "}
            {next ? info.next : `The ${info.name} desk`}
          </span>
          <span className="vq-chip">{info.label}</span>
        </div>
        {next ? (
          <>
            <h1 id="vq-hero-title" className="vq-sr">
              {info.next}: {next.away.name} {next.neutral ? "vs" : "at"}{" "}
              {next.home.name}
            </h1>
            <Link className="vq-matchup" href="#sport-games">
              {team("away")}
              <span className="vq-at" aria-hidden="true">
                {next.neutral ? "vs" : "@"}
              </span>
              {team("home")}
            </Link>
            <div className="vq-hero-meta">
              <span>
                {easternTime(next.start, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET{next.venue ? ` · ${next.venue}` : ""}
                {next.neutral ? " · Neutral site" : ""}
              </span>
              <KickoffCountdown
                kickoff={next.start}
                label={info.countdown}
                liveLabel={info.started}
              />
            </div>
            <div className="vq-hero-actions">
              <Link className="vq-btn" href="#sport-games">
                {action} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="vq-btn ghost" href="#sport-games">
                Full board · {upcoming.length}{" "}
                {upcoming.length === 1 ? "game" : "games"}
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 id="vq-hero-title" className="vq-hero-title">
              {emptyTitle || "No games this week."}
              <br />
              <em>The Vegas Quant read.</em>
            </h1>
            <p className="vq-hero-sub">
              The next {info.name} games appear here as soon as they are
              scheduled.
            </p>
          </>
        )}
      </section>
    </header>
  );
}
