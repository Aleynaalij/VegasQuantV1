import Link from "next/link";
import { Shell, Panel, Stat, Badge } from "./ui";
import { money, time, type Game } from "@/lib/domain";
import type { Overview } from "@/lib/membership";
export default function PublicOverview({
  overview,
  games,
  loading = false,
}: {
  overview?: Overview;
  games: Game[];
  loading?: boolean;
}) {
  const challenge = overview?.challenges[0];
  const stage = overview?.stages.find(
    (s) =>
      s.challenge_id === challenge?.id &&
      s.stage_number === challenge?.current_stage,
  );
  const game = games.find((g) => g.id === stage?.game_id);
  return (
    <Shell>
      <div className="heading">
        <div>
          <div className="eyebrow">THE VEGAS QUANT PROJECT</div>
          <h1>The 5-Spot Challenge</h1>
          <p>5 games. 5 decisions. $20 starting bankroll.</p>
        </div>
        <Link href="/membership" className="primary">
          Member sign in
        </Link>
      </div>
      <div className="stats-grid">
        <Stat label="Starting bankroll" value="$20.00" />
        <Stat
          label="Current bankroll"
          value={challenge ? money(challenge.balance_cents) : "—"}
        />
        <Stat
          label="Target bankroll"
          value="≈ $640"
          note="Aspirational · not guaranteed"
        />
        <Stat
          label="Challenge record"
          value={
            challenge ? `${challenge.wins} W / ${challenge.losses} L` : "—"
          }
        />
      </div>
      <Panel
        title={`Challenge #${challenge?.number || 1}`}
        aside={<Badge>{challenge?.status || "PREP"}</Badge>}
      >
        <div className="notebook">
          <p>
            Stage {challenge?.current_stage || 1} of 5 · Maximum initial loss:
            $20
          </p>
          {game && (
            <>
              <h2>
                {game.away_team} @ {game.home_team}
              </h2>
              <p>
                {game.slot} · {time(game.kickoff)}
              </p>
            </>
          )}
          <p>A stage may be passed when no qualifying edge exists.</p>
        </div>
      </Panel>
      <section className="membership-lock">
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
            <strong>$10</strong>
            <h3>Full 2026 season</h3>
            <p>Remaining regular season, playoffs, and Super Bowl.</p>
          </div>
          <div>
            <strong>$7</strong>
            <h3>Half of what remains</h3>
            <p>
              The next half of remaining weeks and playoff rounds, rounded up.
              Exact expiry shown before payment.
            </p>
          </div>
        </div>
        <Link href="/membership" className="primary">
          View membership options →
        </Link>
        <p className="muted">
          One-time access. No automatic renewal. Membership pays for
          analysis—not wagers or prizes.
        </p>
      </section>
    </Shell>
  );
}
