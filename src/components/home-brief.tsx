import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { Game } from "@/lib/domain";
import TeamLogo from "./team-logo";
import KickoffCountdown from "./kickoff-countdown";
const nick = (team: string) => team.split(" ").at(-1) || team;
const when = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    ...opts,
  });
export default function HomeBrief({ games }: { games: Game[] }) {
  const upcoming = games
    .filter(
      (g) =>
        Date.parse(g.kickoff) > Date.now() &&
        Date.parse(g.kickoff) <= Date.now() + 7 * 86400000,
    )
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  const next = upcoming[0];
  const slate = upcoming.slice(1, 4);
  return (
    <header className="home-brief vq-home">
      <section className="vq-hero" aria-labelledby="vq-hero-title">
        <div className="vq-hero-top">
          <span className="vq-kicker">
            <i aria-hidden="true" /> {next ? "Next kickoff" : "The sports desk"}
          </span>
          <span className="vq-chip">NFL</span>
        </div>
        {next ? (
          <>
            <h1 id="vq-hero-title" className="vq-sr">
              Next kickoff: {next.away_team} at {next.home_team}
            </h1>
            <Link className="vq-matchup" href={`/matchups/${next.slug}`}>
              <span className="vq-team">
                <TeamLogo team={next.away_team} size={64} />
                <b>{nick(next.away_team)}</b>
              </span>
              <span className="vq-at" aria-hidden="true">
                @
              </span>
              <span className="vq-team">
                <TeamLogo team={next.home_team} size={64} />
                <b>{nick(next.home_team)}</b>
              </span>
            </Link>
            <div className="vq-hero-meta">
              <span>
                {when(next.kickoff, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                ET{next.venue ? ` · ${next.venue}` : ""}
              </span>
              <KickoffCountdown kickoff={next.kickoff} />
            </div>
            <div className="vq-hero-actions">
              <Link className="vq-btn" href={`/matchups/${next.slug}`}>
                Open game research <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link className="vq-btn ghost" href="/matchups">
                Full board · {upcoming.length} games
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 id="vq-hero-title" className="vq-hero-title">
              Your game day.
              <br />
              <em>The Vegas Quant read.</em>
            </h1>
            <p className="vq-hero-sub">
              Find the play. Understand the case. Keep the record.
            </p>
            <div className="vq-hero-actions">
              <Link className="vq-btn" href="/matchups">
                Explore the NFL slate{" "}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </>
        )}
      </section>
      {slate.length > 0 && (
        <nav className="vq-slate" aria-label="Upcoming games">
          {slate.map((g) => (
            <Link key={g.id} href={`/matchups/${g.slug}`}>
              <span className="vq-slate-teams">
                <TeamLogo team={g.away_team} size={26} />
                <b>{nick(g.away_team)}</b>
                <small>@</small>
                <TeamLogo team={g.home_team} size={26} />
                <b>{nick(g.home_team)}</b>
              </span>
              <time dateTime={g.kickoff}>
                {when(g.kickoff, {
                  weekday: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </Link>
          ))}
        </nav>
      )}
      <nav className="vq-tiles" aria-label="Sports desk shortcuts">
        <Link href="/matchups">
          <CalendarDays size={18} aria-hidden="true" />
          <span>
            <b>{upcoming.length} games</b>
            <small>This week</small>
          </span>
        </Link>
        <Link href="/feed">
          <Radio size={18} aria-hidden="true" />
          <span>
            <b>The Zone</b>
            <small>What changed & why</small>
          </span>
        </Link>
        <Link href="/history">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            <b>The record</b>
            <small>Every outcome</small>
          </span>
        </Link>
      </nav>
      <Link href="/nba" className="vq-banner">
        <span className="vq-chip hot">NEW</span>
        <span>
          <b>NBA is coming to Vegas Quant.</b>
          <small>
            Picks begin once the regular season starts and the research is
            ready.
          </small>
        </span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </Link>
    </header>
  );
}
