import Link from "next/link";
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
  page?: "home" | "game" | "history";
  gameSlug?: string;
  error?: string;
}) {
  const challenge = overview?.challenges[0];
  const stage = overview?.stages.find(
    (s) =>
      s.challenge_id === challenge?.id &&
      s.stage_number === challenge?.current_stage,
  );
  const game = games.find((g) => gameSlug ? g.slug === gameSlug : g.id === stage?.game_id);
  if (page !== "home") return (
    <Shell active={page}>
      <div className="heading"><div>
        <div className="eyebrow">{page === "game" ? "MATCHUP DESK" : "PERMANENT LEDGER"}</div>
        <h1>{page === "game" ? "Matchup analysis" : "Betting ledger"}</h1>
        <p>{page === "game" ? "Research, market updates, and the history behind each decision." : "Published picks, results, closing-line value, and process grades."}</p>
      </div></div>
      {page === "game" && game && <Panel title={`${game.away_team} @ ${game.home_team}`}><div className="notebook"><p>{game.slot} · {time(game.kickoff)}</p><p>Detailed research is available with an active season pass.</p></div></Panel>}
      <section className="membership-lock" aria-live="polite">
        <span className="eyebrow">MEMBER ACCESS</span>
        <h2>{loading ? "Checking your access…" : error ? "Unable to check access" : page === "game" ? "Unlock the matchup research" : "Unlock the permanent ledger"}</h2>
        <p>{error || (loading ? "Your research will appear here if your account has access." : "Sign in with an active season pass to view this page. Have a friends code? Activate it from your Account page. Administrators must complete verification.")}</p>
        {!loading && <Link href="/membership" className="primary">Sign in / manage access →</Link>}
        {!loading && <p className="muted">Already signed in? Check your pass status under Account.</p>}
      </section>
    </Shell>
  );
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
