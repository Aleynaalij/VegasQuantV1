import NbaGameBoard from "./nba-game-board";
import NbaHomeBrief from "./nba-home-brief";
import NbaHomeTickets from "./nba-home-tickets";
import NbaResearchFeed from "./nba-research-feed";
import {
  ShieldCheck,
} from "lucide-react";
import KickoffCountdown from "./kickoff-countdown";
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
    intro: "Research legs from recent form and the price. Official NBA picks wait for a validated model.",
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
export default function NbaDesk({ view = "home" }: { view?: NbaView }) {
  if (view === "home")
    return (
      <Shell active="home" sport="nba">
        <div className="nba-desk">
          <NbaHomeBrief compact />
          <div id="nba-slate">
            <NbaHomeTickets />
          </div>
        </div>
      </Shell>
    );
  const copy = views[view];
  return (
    <Shell active={view} sport="nba">
      <div className="nba-desk">
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
              Pregame picks stay unpublished until the NBA regular season begins
              and our research is ready.
            </span>
          </div>
        </section>
        {view === "game" && (
          <div id="nba-slate">
            <NbaGameBoard />
          </div>
        )}
        {view === "game" ? (
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
            <NbaResearchFeed />
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
