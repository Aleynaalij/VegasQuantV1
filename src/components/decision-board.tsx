"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
import {
  easternDay,
  windowDecision,
  type BoardGame,
  type BoardTarget,
} from "@/lib/decision-board";
export default function DecisionBoard({ games }: { games: BoardGame[] }) {
  const [now, setNow] = useState<number | null>(null),
    [selected, setSelected] = useState(""),
    [targets, setTargets] = useState<BoardTarget[]>([]),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    async function refresh() {
      setNow(Date.now());
      const r = await supabase
        .from("target_legs")
        .select(
          "id,game_id,analysis_version_id,selection,status,updated_at,current_number,current_odds,what_we_are_waiting_for,playable_number,why_we_like_it,rank",
        )
        .order("updated_at", { ascending: false })
        .limit(300);
      if (live) {
        setTargets(r.data || []);
        setError(
          r.error
            ? "Candidate records could not refresh. Open Analysis to review your access and the latest research."
            : "",
        );
        setLoaded(true);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  if (now === null)
    return (
      <section className="decision-board">
        <h2>Daily decision board</h2>
        <p>Loading game windows…</p>
      </section>
    );
  const today = easternDay(now),
    days = [
      ...new Set([
        today,
        ...games
          .filter(
            (g) =>
              Date.parse(g.kickoff) > now &&
              Date.parse(g.kickoff) <= now + 7 * 86400000,
          )
          .map((g) => easternDay(Date.parse(g.kickoff))),
      ]),
    ].sort();
  const day = days.includes(selected) ? selected : today;
  return (
    <section className="decision-board" aria-label="Daily decision board">
      <header>
        <div>
          <span className="eyebrow">THE DAILY READ</span>
          <h2>Daily decision board</h2>
          <p>Early, afternoon and evening · Eastern time</p>
        </div>
        <label>
          Game day
          <select value={day} onChange={(e) => setSelected(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {d === today ? "Today" : d}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="muted">
        Research checks: noon, 3 PM and 7 PM ET. Candidates stay provisional
        until an official decision is published.
      </p>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      <div className="decision-grid">
        {[
          ["early", "Early games"],
          ["afternoon", "Afternoon games"],
          ["evening", "Evening games"],
        ].map(([key, label]) => {
          const { scheduled, upcoming, candidates } = windowDecision(
            games,
            targets,
            day,
            key,
            now,
          );
          const candidate = candidates[0],
            game = upcoming.find((g) => g.id === candidate?.game_id);
          const stale =
            candidate && now - Date.parse(candidate.updated_at) > 24 * 3600000;
          const status = !scheduled.length
            ? "NO GAME"
            : !upcoming.length
              ? "WINDOW STARTED"
              : error
                ? "UNAVAILABLE"
                : !loaded
                  ? "LOADING"
                  : !candidate
                    ? "WAIT"
                    : candidate.status === "OFFICIAL"
                      ? "OFFICIAL"
                      : candidate.status === "PASS"
                        ? "PASS"
                        : "WAIT";
          return (
            <article className="decision-window" key={key}>
              <div className="decision-window-heading">
                <h3>{label}</h3>
                <span className="eyebrow">{status}</span>
              </div>
              {candidate && game ? (
                <>
                  <p className="muted">
                    {game.away_team} @ {game.home_team} · {time(game.kickoff)}
                  </p>
                  <strong>{candidate.selection}</strong>
                  <p>{candidate.why_we_like_it}</p>
                  <p className="notice">
                    <b>
                      {status === "OFFICIAL"
                        ? "Published decision"
                        : status === "PASS"
                          ? "Published pass reason"
                          : "Waiting for"}
                    </b>
                    <br />
                    {status === "OFFICIAL"
                      ? "Open the matchup to review the original official publication."
                      : candidate.what_we_are_waiting_for ||
                        "Verified current inputs and a defensible qualifying edge."}
                  </p>
                  <small>
                    Research updated {time(candidate.updated_at)}
                    {stale ? " · Older than 24 hours" : ""}. Quote observation
                    time is not established by this timestamp.
                  </small>
                  <p>
                    Recorded price: {candidate.current_number || "Unknown"}
                    {candidate.current_odds !== null
                      ? ` (${candidate.current_odds > 0 ? "+" : ""}${candidate.current_odds})`
                      : ""}
                    <br />
                    Entry limit:{" "}
                    {candidate.playable_number || "Not established"}
                  </p>
                  <Link href={`/games/${game.slug}`}>
                    Open matchup analysis →
                  </Link>
                </>
              ) : (
                <p>
                  {!scheduled.length
                    ? "No NFL game is recorded in this window."
                    : !upcoming.length
                      ? "All recorded games in this window have started. Pregame candidates are no longer shown."
                      : error
                        ? "Research coverage cannot be confirmed."
                        : "No candidate is published in the records available to you. This does not establish that there is no value."}
                </p>
              )}
              {upcoming.length > 0 && (
                <details>
                  <summary>
                    {upcoming.length} upcoming matchup
                    {upcoming.length === 1 ? "" : "s"} · View analysis
                  </summary>
                  {upcoming.map((g) => (
                    <p key={g.id}>
                      <Link href={`/games/${g.slug}`}>
                        {g.away_team} @ {g.home_team} →
                      </Link>
                      <br />
                      <small>{time(g.kickoff)}</small>
                    </p>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </div>
      <small>
        No probability or edge is inferred from a watchlist. Past game windows
        are excluded. Recorded prices may have changed.
      </small>
    </section>
  );
}
