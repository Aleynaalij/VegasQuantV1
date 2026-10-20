"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { noAccess, type Access } from "@/lib/membership";
import { nbaWhen } from "@/lib/nba-home";
import { Empty } from "./ui";
import { nbaResearchRecord, nbaTarget, signed } from "@/lib/nba-research";
import "@/app/nba-research.css";

export type NbaResearchLeg = {
  id: number;
  player: string;
  market: "player_points" | "player_rebounds";
  line: number;
  book: string;
  odds: number;
  cleared: number;
  sample: number;
  median: number;
  break_even: number;
  edge_points: number;
  why: string;
  risk: string;
  away_team: string;
  home_team: string;
  tipoff: string;
  slug: string;
  result: string;
};

/** The NBA Zone feed: labeled research legs (never official picks), member-only, graded from box scores. */
export default function NbaResearchFeed() {
  const [legs, setLegs] = useState<NbaResearchLeg[] | null>(null);
  // The record over every leg, counted in the database, not just the legs listed.
  const [total, setTotal] = useState<ReturnType<typeof nbaResearchRecord> | null>(null);
  const [access, setAccess] = useState<Access>(noAccess);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      const [a, r, all] = await Promise.all([
        supabase.rpc("membership_status"),
        supabase
          .from("nba_research_results")
          .select("id,player,market,line,book,odds,cleared,sample,median,break_even,edge_points,why,risk,away_team,home_team,tipoff,slug,result")
          .order("tipoff", { ascending: false })
          .order("id")
          .limit(100),
        supabase.rpc("nba_research_record").single(),
      ]);
      if (!live) return;
      setAccess(a.error ? noAccess : a.data);
      setError(r.error ? "The NBA research board could not load. Retry in a moment." : "");
      setLegs(r.error ? [] : ((r.data || []) as NbaResearchLeg[]));
      const t = all.data as Record<string, number | string> | null;
      setTotal(all.error || !t ? null : { wins: Number(t.wins), losses: Number(t.losses), pushes: Number(t.pushes), pending: Number(t.pending) });
    }
    void load();
    const stop = onUserChange(() => void load());
    return () => {
      live = false;
      stop();
    };
  }, []);
  if (legs === null) return <p className="nba-board-note">Loading the NBA research board…</p>;
  if (!access.allowed)
    return (
      <Empty title="NBA research board">
        <Link href="/membership">Sign in with research access</Link> to see today’s NBA research legs.
      </Empty>
    );
  if (error) return <p className="nba-board-note" role="status">{error}</p>;
  if (!legs.length)
    return (
      <Empty title="No NBA research legs yet">
        Research legs appear here before tip-off when a line passes our rules.
      </Empty>
    );
  const record = total ?? nbaResearchRecord(legs);
  return (
    <div className="nba-research">
      <p className="nba-research-label">
        Research board · not an official pick. Recent form and the price only; no validated model edge is claimed.
      </p>
      <p className="nba-research-record">
        NBA research record: {record.wins}-{record.losses}
        {record.pushes ? `-${record.pushes}` : ""}
        {record.pending ? ` · ${record.pending} pending` : ""}
      </p>
      <ul>
        {legs.map((l) => (
          <li key={l.id} className={`nba-research-leg is-${l.result.toLowerCase()}`}>
            <header>
              <b>
                {l.player} {nbaTarget(l)}
              </b>
              <span className="nba-research-result">{l.result === "PENDING" ? "Pending" : l.result}</span>
            </header>
            <p className="nba-research-meta">
              <Link href={`/nba/games/${l.slug}`}>
                {l.away_team} @ {l.home_team}
              </Link>{" "}
              · {nbaWhen(l.tipoff, { weekday: "short", hour: "numeric", minute: "2-digit" })} ET · {l.book}{" "}
              {signed(l.odds)}
            </p>
            <p>
              Cleared in {l.cleared} of the last {l.sample} games (median {Number(l.median)}): {Math.round((100 * l.cleared) / l.sample)}% against the{" "}
              {Number(l.break_even)}% this price needs. {l.why}
            </p>
            <p className="nba-research-risk">{l.risk}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
