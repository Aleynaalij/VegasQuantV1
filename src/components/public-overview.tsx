"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import ExploreCards from "./explore-cards";
import ResearchPulse from "./research-pulse";
import ChallengeRun from "./challenge-run";
import { Shell, Panel, Stat, Badge } from "./ui";
import { money, time, type Game } from "@/lib/domain";
import type { Overview } from "@/lib/membership";
export default function PublicOverview({
  overview,
  games,
  loading = false,
  page = "home",
  gameSlug,
  error,
}: {
  overview?: Overview;
  games: Game[];
  loading?: boolean;
  page?: "home" | "game" | "history" | "performance";
  gameSlug?: string;
  error?: string;
}) {
  const [wanted, setWanted] = useState("");
  useEffect(() => {
    setWanted(
      new URLSearchParams(location.search).get("challenge") ||
        sessionStorage.getItem("vq-join-challenge") ||
        "",
    );
  }, []);
  const challenge =
    overview?.challenges.find((c) => c.id === wanted) ||
    overview?.challenges[0];
  const stage = overview?.stages.find(
    (s) =>
      s.challenge_id === challenge?.id &&
      s.stage_number === challenge?.current_stage,
  );
  const game = games.find((g) =>
    gameSlug ? g.slug === gameSlug : g.id === stage?.game_id,
  );
  if (page !== "home")
    return (
      <Shell active={page}>
        <div className="heading">
          <div>
            <div className="eyebrow">
              {page === "game"
                ? "MATCHUP DESK"
                : page === "performance"
                  ? "PERFORMANCE"
                  : "PERMANENT LEDGER"}
            </div>
            <h1>
              {page === "game"
                ? "Matchup analysis"
                : page === "performance"
                  ? "Performance & process"
                  : "Betting ledger"}
            </h1>
            <p>
              {page === "game"
                ? "Research, market updates, and the history behind each decision."
                : "Published picks, results, closing-line value, and process grades."}
            </p>
          </div>
        </div>
        {page === "game" && game && (
          <Panel title={`${game.away_team} @ ${game.home_team}`}>
            <div className="notebook">
              <p>
                {game.slot} · {time(game.kickoff)}
              </p>
              <p>
                Detailed research is available with an active research
                membership.
              </p>
            </div>
          </Panel>
        )}
        {["history", "performance"].includes(page) && <ResearchPulse proof />}
        <section className="membership-lock" aria-live="polite">
          <span className="eyebrow">MEMBER ACCESS</span>
          <h2>
            {loading
              ? "Checking your access…"
              : error
                ? "Unable to check access"
                : page === "game"
                  ? "Unlock the matchup research"
                  : page === "performance"
                    ? "Unlock performance & process"
                    : "Unlock the permanent ledger"}
          </h2>
          <p>
            {error ||
              (loading
                ? "Your research will appear here if your account has access."
                : "Sign in with an active research membership to view this page. Have a friends code? Activate it from your Account page. Administrators must complete verification.")}
          </p>
          {!loading && (
            <Link href="/membership" className="primary">
              Sign in / manage access →
            </Link>
          )}
          {!loading && (
            <p className="muted">
              Already signed in? Check your pass status under Account.
            </p>
          )}
        </section>
      </Shell>
    );
  return (
    <Shell>
      {challenge ? (
        <ChallengeRun
          key={challenge.id}
          challenge={challenge}
          stages={
            overview?.stages.filter((s) => s.challenge_id === challenge.id) ||
            []
          }
        />
      ) : (
        <div className="heading">
          <h1>The 5-Spot Challenge</h1>
          <p>Loading the next run…</p>
        </div>
      )}
      <ExploreCards />
      <ResearchPulse proof />
      <details className="admin-section">
        <summary>How the challenge works</summary>
        <div className="notebook">
          <p>
            Five stages: Thursday night, Sunday early, Sunday late, Sunday night
            and Monday night. Follow each decision at your own pace.
          </p>
          <p>
            The official experiment starts with $20. An approximately $640
            target is aspirational; actual balances use real odds. A stage
            pauses when there is no qualifying edge.
          </p>
          <p>
            Joining and checking in are free. There are no entry fees or prizes.
            Research membership unlocks the analyst’s detailed research.
          </p>
        </div>
      </details>
      <details className="admin-section">
        <summary>Explore the research membership</summary>
        <section className="membership-lock">
          {error && <p role="alert">{error}</p>}
          <span className="eyebrow">THE MEMBER RESEARCH DESK</span>
          <h2>
            {loading
              ? "Checking your access…"
              : "The overview is public. The research is for members."}
          </h2>
          <p>
            Unlock matchup analysis, fair lines, market updates, official picks,
            and the permanent decision history.
          </p>
          <div className="pass-grid">
            <div>
              <strong>$20</strong>
              <h3>Full 2026 season</h3>
              <p>Remaining regular season, playoffs, and Super Bowl.</p>
            </div>
            <div>
              <strong>$5 / month</strong>
              <h3>Monthly access</h3>
              <p>
                Full research access. Renews monthly until canceled. Cancel in
                Account.
              </p>
            </div>
          </div>
          <Link href="/membership" className="primary">
            View membership options →
          </Link>
          <p className="muted">
            Season pass: one payment, no automatic renewal. Monthly: $5 per
            month until canceled. Membership pays for sports analysis and
            tracking.
          </p>
        </section>
      </details>
    </Shell>
  );
}
