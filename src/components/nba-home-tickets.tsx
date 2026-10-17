"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { nbaStatus, type NbaGame } from "@/lib/nba-board";
import "@/app/nba-home-tickets.css";
function Team({ name, code }: { name: string; code: string | null }) {
  const [failed, setFailed] = useState(false);
  const safe = /^[a-z]{2,4}$/i.test(code || "");
  return (
    <span className="nba-ticket-team">
      {safe && !failed ? (
        <img
          src={`https://a.espncdn.com/i/teamlogos/nba/500/${code!.toLowerCase()}.png`}
          alt=""
          width={48}
          height={48}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="nba-ticket-fallback">{code || name.slice(0, 3)}</span>
      )}
      <b>
        {name.replace(/^.*? (?=Trail Blazers$)/, "") === name
          ? name.split(" ").at(-1)
          : "Trail Blazers"}
      </b>
    </span>
  );
}
export default function NbaHomeTickets() {
  const [games, setGames] = useState<NbaGame[]>([]),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true;
    async function load() {
      const at = Date.now();
      const r = await supabase
        .from("nba_games")
        .select(
          "id,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,status,venue,season_type",
        )
        .eq("season_type", 2)
        .gte("tipoff", new Date(at).toISOString())
        .lte("tipoff", new Date(at + 7 * 86400000).toISOString())
        .order("tipoff")
        .order("id")
        .limit(60);
      if (!live) return;
      setError(!!r.error);
      if (!r.error)
        setGames(
          (r.data || []).filter(
            (g) => !/FINAL|CANCEL|POSTPON|SUSPEND/.test(g.status || ""),
          ) as NbaGame[],
        );
      setNow(at);
      setLoading(false);
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <section className="nba-home-tickets" aria-labelledby="nba-tickets-title">
      <header>
        <div>
          <span className="eyebrow">THIS WEEK</span>
          <h2 id="nba-tickets-title">On the court</h2>
        </div>
        <Link href="/nba/analysis">Full schedule →</Link>
      </header>
      <p className="nba-ticket-hint">Swipe through the games</p>
      {loading && <p role="status">Loading games…</p>}
      {error && (
        <p role="status">
          Schedule could not refresh. Any shown games may be older.
        </p>
      )}
      {!loading && !error && !games.length && (
        <p>No upcoming games are available yet.</p>
      )}
      <div
        className="nba-ticket-rail"
        role="list"
        aria-label="Upcoming NBA game tickets"
      >
        {games.map((g, i) => (
          <article className="nba-game-ticket" role="listitem" key={g.id}>
            <div className="nba-ticket-top">
              <span>NBA · REGULAR SEASON</span>
              <b>{String(i + 1).padStart(2, "0")}</b>
            </div>
            <div className="nba-ticket-matchup">
              <Team name={g.away_team} code={g.away_abbreviation} />
              <span>@</span>
              <Team name={g.home_team} code={g.home_abbreviation} />
            </div>
            <div className="nba-ticket-bottom">
              <strong>
                {new Date(g.tipoff).toLocaleString("en-US", {
                  timeZone: "America/New_York",
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  ...(g.tipoff_tbd
                    ? {}
                    : { hour: "numeric", minute: "2-digit" }),
                })}
                {g.tipoff_tbd ? " · Time TBD" : " ET"}
              </strong>
              <span>{g.venue || "Venue to be confirmed"}</span>
              <small>{nbaStatus(g, now)}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
