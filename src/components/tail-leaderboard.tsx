"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Row = {
  username: string;
  wins: number;
  losses: number;
  pushes: number;
  score: number;
};

// Weekly leaderboard of verified tailed-pick results (members with a visible profile, 3+ decided legs).
export default function TailLeaderboard() {
  const [days, setDays] = useState(7),
    [rows, setRows] = useState<Row[] | null>(null),
    [signedIn, setSignedIn] = useState(false),
    [failed, setFailed] = useState(false),
    [all, setAll] = useState(false);
  useEffect(() => {
    let live = true;
    async function load() {
      const s = await supabase.auth.getSession();
      if (!live) return;
      setSignedIn(!!s.data.session);
      if (!s.data.session) return setRows([]);
      const r = await supabase.rpc("tail_leaderboard", { p_days: days });
      if (!live) return;
      setFailed(!!r.error);
      setRows(r.error ? [] : ((r.data || []) as Row[]));
    }
    void load();
    return () => {
      live = false;
    };
  }, [days]);
  return (
    <section className="community-panel vq-board" aria-label="Tail leaderboard">
      <div className="vq-board-head">
        <h2>Tail leaderboard</h2>
        <div role="group" aria-label="Period">
          {[7, 30].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d === 7 ? "This week" : "30 days"}
            </button>
          ))}
        </div>
      </div>
      {rows === null ? (
        <p role="status">Loading…</p>
      ) : !signedIn ? (
        <p>
          <Link href="/membership">Sign in</Link> to see the leaderboard.
        </p>
      ) : failed ? (
        <p role="status">The leaderboard couldn’t load just now.</p>
      ) : rows.length ? (
        <ol>
          {(all ? rows : rows.slice(0, 5)).map((r, i) => (
            <li key={r.username}>
              <span className="vq-board-rank">{i + 1}</span>
              <Link href={`/community/${encodeURIComponent(r.username)}`}>
                @{r.username}
              </Link>
              <b>
                {r.wins}–{r.losses}
                {r.pushes ? `–${r.pushes}` : ""}
              </b>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          No one qualifies yet. Members appear after 3 tailed legs are graded
          with a verified result in this period.
        </p>
      )}
      {!!rows?.length && rows.length > 5 && (
        <button
          type="button"
          className="text-link"
          onClick={() => setAll((v) => !v)}
        >
          {all ? "Show top 5" : `Show all ${rows.length}`}
        </button>
      )}
      <small>
        Ranked by win rate with sample size taken into account, so tailing
        everything doesn’t win. Tails lock at kickoff. Only members with a
        visible profile are shown.
      </small>
    </section>
  );
}
