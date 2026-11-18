"use client";
import { viewerAuth } from "@/lib/viewer-auth";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Bookmark, Search, RefreshCw } from "lucide-react";
import type { Game } from "@/lib/domain";
import type { ResearchEvent } from "@/lib/research-hub";
import type { Sport } from "@/lib/sports";
import { SPORTS, liveSports } from "@/lib/sports";
import { readResearchHub, type HubData } from "@/lib/research-hub-reader";
import { useTonightSchedules } from "@/lib/use-tonight-schedules";
import { startLabel, statusLabel, type TonightGame } from "@/lib/vq-tonight";
import { supabase } from "@/lib/supabase";
import { watchDiscoveryAccess } from "@/lib/discovery/revalidate";
import { compactText, findingHref } from "@/lib/discovery/model";
import {
  homeResearch,
  HOME_TOOLS,
  homeTimestamp,
  stageHomeGames,
} from "@/lib/home2";
import SectionBoundary from "@/components/section-boundary";
import CommunityStories from "@/components/community-stories";
import HomeDealer from "./home-dealer";
import "./home2.css";

export type Home2Props = {
  nflGames: Game[];
  nflUnavailable?: boolean;
  zoneHref?: string;
  gameHref?: (event: ResearchEvent | TonightGame) => string;
};
/** Real consumer content. The integration owner supplies the enclosing shell and rollout gate. */
export default function Home2({
  nflGames,
  nflUnavailable = false,
  zoneHref = "/community",
  gameHref,
}: Home2Props) {
  const router = useRouter();
  const combined = process.env.VQ_COMBINED_STAGE_BUILD === "1";
  const {
    now,
    day,
    rows: ordinaryRows,
    loads,
    load,
  } = useTonightSchedules(nflGames, nflUnavailable, !combined);
  const [sport, setSport] = useState<Sport | "all">("all");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<HubData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true,
      generation = 0;
    const clear = () => {
      ++generation;
      setData(null);
      setFailed(false);
    };
    const read = async () => {
      const own = ++generation;
      try {
        const result = await readResearchHub();
        if (active && own === generation) setData(result);
      } catch {
        if (active && own === generation) {
          setData(null);
          setFailed(true);
        }
      }
    };
    void read();
    const stop = watchDiscoveryAccess(
      clear,
      () => void read(),
      (changed) => {
        const { data: subscription } = viewerAuth.onAuthStateChange(changed);
        return () => subscription.subscription.unsubscribe();
      },
    );
    return () => {
      active = false;
      ++generation;
      stop();
    };
  }, [attempt]);
  const rows = combined ? stageHomeGames(data, now) : ordinaryRows;
  const stageUnavailable =
    failed || (!!data && (!data.signedIn || data.denied));
  const nflScheduleUnavailable = combined
    ? stageUnavailable
    : nflUnavailable;
  const member = data?.signedIn === true;
  const research = homeResearch(data, sport);
  const games = rows.filter(
    (g) =>
      (sport === "all" || sport === g.sport) &&
      `${g.away} ${g.home} ${g.sport}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const loadingSports = (["nba", "nhl", "ncaab"] as const).filter((s) =>
    combined ? !data && !failed : loads[s].state === "loading",
  );
  const failedSports = (["nba", "nhl", "ncaab"] as const).filter((s) =>
    combined ? stageUnavailable : loads[s].state === "error",
  );
  const staleSports = (["nba", "nhl", "ncaab"] as const).filter(
    (s) => !combined && loads[s].state === "ok" && loads[s].stale,
  );
  const retry = () => {
    if (combined) {
      setData(null);
      setFailed(false);
      setAttempt((n) => n + 1);
      return;
    }
    failedSports.forEach((s) => void load(s));
    if (nflScheduleUnavailable) router.refresh();
  };
  return (
    <div className="home2">
      <header className="h2-top">
        <span className="h2-eyebrow">Vegas Quant / Intelligence dashboard</span>
      </header>
      <section
        className={`h2-welcome ${member ? "h2-returning" : ""}`}
        aria-labelledby="home2-title"
      >
        <span className="h2-eyebrow">
          {member ? "Welcome back" : "Your seat at the table"}
        </span>
        <h1 id="home2-title">
          {member ? (
            "Your next move starts here."
          ) : (
            <>
              Every game has
              <br />
              <em>a deeper story.</em>
            </>
          )}
        </h1>
        <p>
          {member
            ? "Find today’s matchups, inspect the evidence, and keep your perspective."
            : "Matchup research, transparent publications, and a sports-minded community in one place."}
        </p>
        <div className="h2-actions">
          <a className="h2-button" href="#home2-games">
            Explore today’s games
          </a>
          <Link className="h2-button secondary" href={zoneHref}>
            Enter The Zone <ArrowUpRight size={16} />
          </Link>
        </div>
        {!data && !failed && (
          <p role="status" className="h2-note">
            Checking your research access…
          </p>
        )}
        {data && !data.signedIn && (
          <p className="h2-note">
            <Link href="/membership">Sign in</Link> to open protected research
            and your collection.
          </p>
        )}
      </section>
      <section className="h2-tools" aria-label="Your tools">
        {HOME_TOOLS.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <strong>{tool.title}</strong>
            <span>{tool.detail}</span>
          </Link>
        ))}
        <div>
          <strong>Simulator</strong>
          <span>In development · not available yet</span>
        </div>
      </section>
      <SectionBoundary name="Stories">
        <CommunityStories placement="lobby" />
      </SectionBoundary>
      <section id="home2-games" aria-labelledby="home2-games-title">
        <div className="h2-heading">
          <div>
            <span className="h2-eyebrow">{day.label} · Eastern time</span>
            <h2 id="home2-games-title">Tonight’s intelligence</h2>
          </div>
          <Link href="/research">
            All research <ArrowUpRight size={16} />
          </Link>
        </div>
        <div
          className="h2-filter"
          role="group"
          aria-label="Filter dashboard by sport"
        >
          <button
            aria-pressed={sport === "all"}
            onClick={() => setSport("all")}
          >
            All sports
          </button>
          {liveSports().map((s) => (
            <button
              key={s}
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
            >
              {SPORTS[s].label}
            </button>
          ))}
        </div>
        <label className="h2-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search today’s matchups</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a team or matchup"
            type="search"
          />
        </label>
        {loadingSports.length > 0 && (
          <p role="status">
            Loading {loadingSports.map((s) => SPORTS[s].label).join(", ")}{" "}
            schedules…
          </p>
        )}
        {(failedSports.length > 0 || nflScheduleUnavailable) && (
          <p className="h2-notice" role="status">
            {[
              ...(nflScheduleUnavailable ? ["NFL"] : []),
              ...failedSports.map((s) => SPORTS[s].label),
            ].join(", ")}{" "}
            schedules unavailable. Other games remain accessible.{" "}
            <button onClick={retry}>Retry schedules</button>
          </p>
        )}
        {combined &&
          data &&
          !data.denied &&
          (data.errors.length > 0 || data.truncated) && (
            <p className="h2-notice">
              Partial schedule or research coverage. Returned games are shown;
              missing records are unverified.
            </p>
          )}
        {staleSports.length > 0 && (
          <p className="h2-notice">
            {staleSports.map((s) => SPORTS[s].label).join(", ")} show the
            previous schedule read because refresh failed.
          </p>
        )}
        <div className="h2-games">
          {games.map((g) => (
            <Link
              className="h2-game"
              key={`${g.sport}:${g.id}`}
              href={gameHref ? gameHref(g) : g.href}
            >
              <div className="h2-between">
                <span className="h2-eyebrow">{SPORTS[g.sport].label}</span>
                <span>{startLabel(g)}</span>
              </div>
              <h3>
                <span>{g.away}</span>
                <small>at</small>
                <span>{g.home}</span>
              </h3>
              <div className="h2-between">
                <span>{statusLabel(g.status) || "Scheduled"}</span>
                <span>
                  Open game <ArrowUpRight size={15} />
                </span>
              </div>
            </Link>
          ))}
        </div>
        {!games.length && !loadingSports.length && (
          <p className="h2-empty">
            {failedSports.length || nflScheduleUnavailable
              ? "No matching games in the schedules currently available."
              : "No games match these filters today."}
          </p>
        )}
        <nav className="h2-desks" aria-label="Sport intelligence desks">
          {liveSports().map((s) => (
            <Link key={s} href={SPORTS[s].home}>
              {SPORTS[s].label} desk ↗
            </Link>
          ))}
        </nav>
      </section>
      <section aria-labelledby="home2-research-title">
        <div className="h2-heading">
          <div>
            <span className="h2-eyebrow">
              Latest available evidence · not personalized
            </span>
            <h2 id="home2-research-title">Research in focus</h2>
          </div>
          <button
            className="h2-refresh"
            onClick={() => {
              setData(null);
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            <RefreshCw size={16} /> Refresh research
          </button>
        </div>
        {failed && (
          <p role="status" className="h2-notice">
            Research could not load. The schedules and other tools remain
            available.
          </p>
        )}
        {data?.denied && (
          <p className="h2-notice">
            {member
              ? "Research access is required for this account."
              : "Sign in to check research availability."}{" "}
            <Link href="/membership">Review access</Link>
          </p>
        )}
        {data && !data.denied && (data.errors.length > 0 || data.truncated) && (
          <p className="h2-notice">
            Partial research coverage. Missing records are not evidence that no
            research exists.
          </p>
        )}
        <div className="h2-research">
          {research.map(({ finding, event }) => (
            <article key={`${event.key}:${finding.id}`}>
              <span className="h2-eyebrow">
                {SPORTS[event.sport].label} / {finding.label}
              </span>
              <h3>{finding.title}</h3>
              <p className="h2-matchup">
                {event.away} at {event.home}
              </p>
              <p>
                {compactText(finding.text, 220) ||
                  "No readable detail supplied."}
              </p>
              <p className="h2-note">
                {finding.label === "Published research"
                  ? "Published"
                  : "Recorded"}
                : {homeTimestamp(finding.recordedAt)}
              </p>
              <details>
                <summary>Sources and timing</summary>
                <p>Source time: {homeTimestamp(finding.sourceAt)}</p>
                {finding.sources.length ? (
                  <ul>
                    {finding.sources.map((url) => (
                      <li key={url}>
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {new URL(url).hostname}
                          <span className="sr-only"> (opens a new tab)</span> ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No source link supplied.</p>
                )}
              </details>
              <Link
                href={gameHref ? gameHref(event) : findingHref(event, finding)}
              >
                Inspect research <ArrowUpRight size={16} />
              </Link>
              {finding.publicationHref && (
                <Link href={finding.publicationHref}>
                  Original publication ↗
                </Link>
              )}
            </article>
          ))}
        </div>
        {data && !data.denied && !research.length && (
          <p className="h2-empty">
            No research returned for this filter. Try another sport or visit the
            research center.
          </p>
        )}
      </section>
      <aside className="h2-zone">
        <span className="h2-eyebrow">The Dealer / Community</span>
        <h2>The research. The reasons. The conversation.</h2>
        <SectionBoundary name="Dealer publications">
          <HomeDealer sport={sport} zoneHref={zoneHref} />
        </SectionBoundary>
        <p>
          Open compact publications in The Zone. Full charts, source notes and
          the original research remain available there.
        </p>
        <Link className="h2-button" href={zoneHref}>
          Open The Zone <ArrowUpRight size={16} />
        </Link>
        {member && (
          <Link className="h2-collection" href="/saved">
            <Bookmark size={16} /> Revisit saved picks
          </Link>
        )}
      </aside>
      <footer className="h2-footer">
        <p>
          Research, not guarantees. Availability and account access vary. MLB
          development is planned for February 2027.
        </p>
      </footer>
    </div>
  );
}
