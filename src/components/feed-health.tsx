"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time, type Game } from "@/lib/domain";
import { Shell, Panel } from "./ui";
import SourceObservations from "./source-observations";
import ManualResult from "./manual-result";
import { feedAlerts, researchDeadline } from "@/lib/feed-health";
export default function FeedHealth() {
  const [allowed, setAllowed] = useState(false),
    [rows, setRows] = useState<
      {
        id: string;
        provider: string;
        status: string;
        details: Record<string, unknown>;
        created_at: string;
      }[]
    >([]),
    [games, setGames] = useState<Game[]>([]),
    [game, setGame] = useState("");
  const [latestResearch, setLatestResearch] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(Date.now());
  const [error, setError] = useState("");
  const [pendingResults, setPendingResults] = useState<
    {
      leg_key: string;
      name: string;
      market: string;
      matchup: string;
      expires_at: string;
    }[]
  >([]);
  const [resultError, setResultError] = useState("");
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function refresh() {
      const request = ++epoch;
      const a = await supabase.rpc("is_admin");
      if (!live || request !== epoch) return;
      setAllowed(a.data === true);
      if (!a.data) {
        setRows([]);
        setPendingResults([]);
        return;
      }
      const [r, g, research, results] = await Promise.all([
        supabase
          .from("feed_runs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase.from("games").select("*").order("kickoff"),
        supabase
          .from("research_feed_posts")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("published_legs")
          .select("leg_key,name,market,matchup,expires_at")
          .is("result", null)
          // Official picks settle through the admin result flow, not research_leg_results.
          .neq("kind", "OFFICIAL")
          .lt("expires_at", new Date(Date.now() - 6 * 3600000).toISOString())
          .order("expires_at", { ascending: true })
          .limit(100),
      ]);
      if (live && request === epoch) {
        setPendingResults(results.error ? [] : results.data || []);
        setResultError(
          results.error ? "Result review queue could not load." : "",
        );
        setRows(r.data || []);
        setGames(g.data || []);
        setLatestResearch(research.data?.[0]?.created_at || null);
        setCheckedAt(Date.now());
        setError(
          r.error || g.error || research.error
            ? "Health queries failed; coverage cannot be verified."
            : "",
        );
      }
    }
    void refresh();
    const t = setInterval(refresh, 30000);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setAllowed(false);
      setRows([]);
      setPendingResults([]);
      setTimeout(() => {
        if (live) void refresh();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      auth.data.subscription.unsubscribe();
      clearInterval(t);
    };
  }, []);
  // Why the latest automatic result run skipped each selection, if it did.
  const syncReasons = new Map(
    (
      (rows.find((r) => r.provider === "Editorial result sync")?.details
        ?.blockers as { leg_key: string; reason: string }[] | undefined) || []
    ).map((b) => [b.leg_key, b.reason]),
  );
  return (
    <Shell active="admin">
      <h1>Data feed health</h1>
      <Link href="/admin">← Admin</Link>
      {!allowed ? (
        <p>Sign in and verify your administrator account.</p>
      ) : (
        <>
          <Panel title="Needs attention">
            <div className="notebook" role="status">
              {error && <p>{error}</p>}
              {feedAlerts(rows, checkedAt).map((a) => (
                <p key={a.provider}>
                  <strong>{a.provider}</strong> · {a.reason}
                </p>
              ))}
              {researchDeadline(latestResearch, checkedAt) && (
                <p>{researchDeadline(latestResearch, checkedAt)}</p>
              )}
              {!error &&
                !feedAlerts(rows, checkedAt).length &&
                !researchDeadline(latestResearch, checkedAt) && (
                  <p>
                    Required feeds and research publication checks are current.
                  </p>
                )}
              <p>
                Checked {time(new Date(checkedAt).toISOString())}. This
                dashboard checks publication timing; it does not confirm every
                game was researched.
              </p>
            </div>
          </Panel>
          <Panel title="Launch and reliability priorities">
            <div className="notebook">
              <h3>1 · Connect FanDuel coverage</h3>
              <p>
                Add the approved provider key securely to Supabase Edge Function
                secrets, then enable ODDS_FEED_ENABLED and ODDS_PROPS_ENABLED.
                Verify a completed run and exact FanDuel quotes, provider
                timestamps and retrieval times. Deployment alone is not evidence
                of coverage.
              </p>
              <p>
                Do not put API keys in chat or browser code. Supported unpriced
                editorial targets may still publish; missing odds are displayed
                as unknown.
              </p>
              <h3>2 · Verify outcomes</h3>
              <p>
                The scheduled worker verifies supported full-game NFL player
                stats automatically. Review unsupported or blocked selections in
                the latest Editorial result sync run and the queue below against
                the exact published market and source. A final score alone does
                not settle a player prop. Missing evidence stays pending in
                member Records; no stakes or profit are assumed.
              </p>
              <h3>3 · Finish launch acceptance</h3>
              <p>
                Age enforcement remains off pending provider activation and live
                testing. Complete the monitored support inbox, counsel review,
                real-device deletion and moderation tests, then native iOS
                packaging and billing review. These items are not certified
                complete by this dashboard.
              </p>
              <p>
                Phone feed-failure delivery is not verified. Use this dashboard
                for feed checks; do not rely on a phone alert or SMS.
              </p>
              <Link href="/admin/accounts">Account operations →</Link>
            </div>
          </Panel>
          <Panel title="Published picks awaiting result review">
            <p>
              Up to 100 oldest ungraded selections whose window ended more than
              six hours ago. This delay is a review filter, not proof the game
              is final. Full-game player yards and receptions grade
              automatically once ESPN and nflverse agree; grade the rest here
              from a final source. Use VOID for watch notes that were never a
              pick.
            </p>
            {resultError ? (
              <p role="status">{resultError}</p>
            ) : !pendingResults.length ? (
              <p>No ungraded selections in this review window.</p>
            ) : (
              pendingResults.map((p) => (
                <article className="ledger-card" key={p.leg_key}>
                  <h3>{p.name}</h3>
                  <p>
                    {p.market} · {p.matchup}
                  </p>
                  <p>Window ended {time(p.expires_at)}</p>
                  {syncReasons.get(p.leg_key) && (
                    <p>Automatic sync: {syncReasons.get(p.leg_key)}</p>
                  )}
                  <code>{p.leg_key}</code>
                  <ManualResult
                    legKey={p.leg_key}
                    label={`${p.name} · ${p.market}`}
                    onRecorded={() =>
                      setPendingResults((list) =>
                        list.filter((x) => x.leg_key !== p.leg_key),
                      )
                    }
                  />
                </article>
              ))
            )}
          </Panel>
          <Panel title="Source coverage">
            <div className="notebook">
              <p>
                Schedule, scores, injury statuses and linked news headlines:
                ESPN source ingestion. FanDuel odds: The Odds API, requiring a
                configured key and enabled feed. Rushing and receiving props
                additionally require ODDS_PROPS_ENABLED and provider access to
                those markets. Missing or partial coverage is reported
                explicitly.
              </p>
              <p>
                Injury tiers, market interpretation and weather point
                adjustments remain analyst-supplied. Missing feeds are never
                filled with generated facts.
              </p>
              <p>
                Scores and closing-price candidates require review before
                official settlement. This pipeline never changes official picks,
                targets, projections or bankrolls.
              </p>
            </div>
          </Panel>
          <label>
            Game
            <select value={game} onChange={(e) => setGame(e.target.value)}>
              <option value="">Choose matchup</option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.away_team} @ {g.home_team} · {time(g.kickoff)}
                </option>
              ))}
            </select>
          </label>
          {game && <SourceObservations gameId={game} />}
          <Panel title="Recent ingestion runs">
            <div className="notebook">
              {rows.length ? (
                rows.map((r) => (
                  <div className="mi-item" key={r.id}>
                    <strong>
                      {r.provider} · {r.status}
                    </strong>
                    <p>{time(r.created_at)}</p>
                    <pre className="mi-preview">
                      {JSON.stringify(r.details, null, 2)}
                    </pre>
                  </div>
                ))
              ) : (
                <p>No runs recorded. The feed is not yet verified active.</p>
              )}
            </div>
          </Panel>
        </>
      )}
    </Shell>
  );
}
