"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { money, odd, time } from "@/lib/domain";
import { freshness } from "@/lib/freshness";
import { Badge, Panel } from "./ui";
type PublicResult = {
  id: string;
  game: string;
  published_at: string;
  selection: string | null;
  odds: number | null;
  result: string;
  profit_cents: number | null;
  stake_cents: number | null;
  closing_recorded: boolean;
};
type Status = {
  updated_at: string | null;
  games: { game_id: string; updated_at: string; versions: number }[];
  results: PublicResult[];
};
export default function ResearchPulse({ proof = false }: { proof?: boolean }) {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(false),
    [now, setNow] = useState(0);
  useEffect(() => {
    let live = true;
    async function refresh() {
      const r = await supabase.rpc("public_research_status");
      if (live) {
        setError(!!r.error);
        if (!r.error) setStatus(r.data);
        setNow(Date.now());
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  if (error)
    return (
      <p className="muted" role="status">
        Research update time is temporarily unavailable.
      </p>
    );
  if (!status) return null;
  const age = freshness(status.updated_at, now),
    settled = status.results.filter((r) => r.result !== "PENDING"),
    wins = settled.filter((r) => r.result === "WIN").length,
    losses = settled.filter((r) => r.result === "LOSS").length,
    profit = settled.reduce((sum, r) => sum + (r.profit_cents || 0), 0),
    stake = settled
      .filter((r) => r.result !== "VOID")
      .reduce((sum, r) => sum + (r.stake_cents || 0), 0);
  return (
    <Panel
      title={proof ? "The record, in public" : "From the research desk"}
      aside={<Badge tone={age.tone}>{age.label}</Badge>}
    >
      <div className="notebook">
        <p>
          {status.updated_at ? (
            <>
              <strong>Last research publication</strong> ·{" "}
              <time dateTime={status.updated_at}>
                {time(status.updated_at)}
              </time>
            </>
          ) : (
            "Research publication pending."
          )}
        </p>
        {!proof && (
          <>
            <p>
              {status.games.length} matchups have research histories. Watchlists
              stay provisional until an official package is published; WAIT and
              PASS are valid outcomes.
            </p>
            <Link className="text-link" href="/feed">
              See what changed →
            </Link>
          </>
        )}
        {proof && (
          <>
            <div className="proof-stats">
              <strong>
                {wins}W / {losses}L
              </strong>
              <span>
                {settled.length} settled ·{" "}
                {status.results.length - settled.length} pending
              </span>
              <span>
                {money(profit)} net ·{" "}
                {stake ? `${((profit / stake) * 100).toFixed(1)}%` : "—"} ROI
              </span>
            </div>
            <p className="muted">
              All published decisions are included. A small sample does not
              establish predictive accuracy. Missing closing data stays unknown.
            </p>
            <div className="proof-list">
              {status.results.map((r) => (
                <article key={r.id}>
                  <Badge
                    tone={
                      r.result === "WIN"
                        ? "green"
                        : r.result === "LOSS"
                          ? "red"
                          : "muted"
                    }
                  >
                    {r.result}
                  </Badge>
                  <h3>
                    {r.selection || "Published decision · member details"}
                  </h3>
                  <p>
                    {r.game}
                    {r.odds !== null ? ` · ${odd(r.odds)}` : ""}
                  </p>
                  <small>
                    Published {time(r.published_at)} ·{" "}
                    {r.closing_recorded
                      ? "Closing observation recorded"
                      : "CLV unverified — closing observation missing"}
                  </small>
                </article>
              ))}
            </div>
            <Link href="/methodology">How we measure decisions →</Link>
          </>
        )}
      </div>
    </Panel>
  );
}
