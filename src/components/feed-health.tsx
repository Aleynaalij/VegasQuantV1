"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time, type Game } from "@/lib/domain";
import { Shell, Panel } from "./ui";
import SourceObservations from "./source-observations";
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
  useEffect(() => {
    let live = true;
    async function refresh() {
      const a = await supabase.rpc("is_admin");
      if (!live) return;
      setAllowed(a.data === true);
      if (!a.data) {
        setRows([]);
        return;
      }
      const [r, g, research] = await Promise.all([
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
      ]);
      if (live) {
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
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
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
          <Panel title="Admin phone alerts">
            <div className="notebook">
              <p>
                Feed failures and missed publication windows are checked every
                five minutes. One neutral alert is queued per incident for
                administrator devices with notifications enabled and the updated
                app active. Repeated checks of the same incident do not repeat
                the alert.
              </p>
              <p>
                Open the updated app on your phone to register this device.
                Delivery depends on your browser and phone settings.
              </p>
            </div>
          </Panel>
          <Panel title="Source coverage">
            <div className="notebook">
              <p>
                Schedule, scores, injury statuses and linked news headlines:
                ESPN source ingestion. Optional FD/DK odds: The Odds API,
                requiring a configured key and enabled feed. Rushing and
                receiving props additionally require ODDS_PROPS_ENABLED and
                provider access to those markets. Missing or partial coverage is
                reported explicitly.
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
