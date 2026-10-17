import Link from "next/link";
import NbaGameBoard from "./nba-game-board";
import NbaHomeBrief from "./nba-home-brief";
import {
  Activity,
  BookMarked,
  BookOpen,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import KickoffCountdown from "./kickoff-countdown";
import RuleChips from "./rule-chips";
import { findRule, type BibleRule } from "@/lib/nba-rules";
import { Empty, Panel, Shell } from "./ui";

type NbaView = "home" | "game" | "feed" | "history";
const views = {
  home: {
    title: "The NBA research board.",
    intro:
      "Schedules, scores and sourced market research. Regular-season selections wait for verified research.",
  },
  game: {
    title: "NBA research lab",
    intro:
      "Start with minutes and role. Then evaluate opportunity, matchup and the price.",
  },
  feed: {
    title: "The Zone · NBA",
    intro: "Basketball research and selections will have their own space here.",
  },
  history: {
    title: "NBA records",
    intro:
      "A separate record for basketball, built on timestamped research and transparent outcomes.",
  },
} as const;
const priorities = [
  {
    title: "Minutes & rotation",
    text: "Expected minutes, starting roles, bench rotations and coaching changes.",
  },
  {
    title: "Opportunity & workload",
    text: "Shot attempts, touches, potential assists and rebound chances before stat targets.",
  },
  {
    title: "Availability & matchup",
    text: "Confirmed availability, rest, pace, defensive assignments and blowout risk.",
  },
  {
    title: "Price & review",
    text: "Exact sportsbook quotes, correlation, failure paths and a separate NBA validation record.",
  },
];
/** Regular season opens October 20, 2026 (The NBA Betting Bible, Part III). Midnight ET. */
const openingDay = "2026-10-20T04:00:00Z";
const gradingRules = ["R-01", "R-02", "R-07", "R-20", "R-30", "R-39"]
  .map(findRule)
  .filter((rule): rule is BibleRule => !!rule);
export default function NbaDesk({ view = "home" }: { view?: NbaView }) {
  const copy = views[view];
  return (
    <Shell active={view} sport="nba">
      <div className="nba-desk">
        {view === "home" ? (
          <NbaHomeBrief />
        ) : (
          <section className="nba-hero">
            <span className="nba-eyebrow">VEGAS QUANT · BASKETBALL</span>
            <span className="badge muted">Preparation mode</span>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
            <div className="nba-opening">
              <span>
                <b>Opening night</b> · Tue, Oct 20, 2026
              </span>
              <KickoffCountdown
                kickoff={openingDay}
                label="Time to NBA opening day"
                liveLabel="Season underway"
              />
            </div>
            <div className="nba-launch-note">
              <ShieldCheck size={20} aria-hidden="true" />
              <span>
                Pregame picks stay unpublished until the NBA regular season
                begins and our research is ready.
              </span>
            </div>
          </section>
        )}
        {(view === "home" || view === "game") && (
          <div id="nba-slate">
            <NbaGameBoard />
          </div>
        )}
        {view === "home" ? (
          <>
            <div className="nba-destinations">
              <Link href="/nba/analysis">
                <BookOpen aria-hidden="true" />
                <strong>Research lab</strong>
                <span>Explore our basketball evaluation framework →</span>
              </Link>
              <Link href="/nba/zone">
                <Activity aria-hidden="true" />
                <strong>The NBA Zone</strong>
                <span>A dedicated feed for basketball →</span>
              </Link>
              <Link href="/nba/rules">
                <BookMarked aria-hidden="true" />
                <strong>The rulebook</strong>
                <span>The 40 commandments behind every play →</span>
              </Link>
            </div>
            <Panel title="How every NBA play and pass is graded">
              <div className="nba-grading">
                <p>
                  Each NBA play and each pass cites the Bible rules behind it.
                  Tap a rule to read it. These six apply to every decision:
                </p>
                <RuleChips rules={gradingRules} label="Core rules" />
              </div>
            </Panel>
            <Panel title="Building toward opening night">
              <div className="nba-readiness">
                <p>
                  <strong>Platform foundation</strong>
                  <span>
                    Sport switch and separate NBA views are ready for
                    preparation.
                  </span>
                </p>
                <p>
                  <strong>Data connections · Verification</strong>
                  <span>
                    Schedules, scores, injuries and sportsbook snapshots are
                    being verified. Player logs and rotation research remain
                    ahead.
                  </span>
                </p>
                <p>
                  <strong>Research validation · Ahead</strong>
                  <span>
                    Track prospective NBA analysis before making performance or
                    edge claims.
                  </span>
                </p>
              </div>
            </Panel>
          </>
        ) : null}
        {view === "home" || view === "game" ? (
          <Panel title="What we’ll study">
            <div className="nba-priorities">
              {priorities.map((item) => (
                <article key={item.title}>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </article>
              ))}
            </div>
          </Panel>
        ) : null}
        {view === "feed" ? (
          <Panel title="Basketball feed">
            <Empty title="No NBA picks published">
              <CalendarDays size={20} aria-hidden="true" /> We’ll begin
              supported pregame selections once the regular season starts and
              the data is ready. NFL research remains on the NFL side.
            </Empty>
          </Panel>
        ) : null}
        {view === "history" ? (
          <Panel title="Basketball history">
            <Empty title="A fresh NBA record">
              There are no NBA selections or results to report yet. Basketball
              results will remain separate from NFL records.
            </Empty>
          </Panel>
        ) : null}
      </div>
    </Shell>
  );
}
