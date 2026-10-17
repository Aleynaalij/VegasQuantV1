"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { noAccess, type Access } from "@/lib/membership";
import {
  nbaPhase,
  nbaStatus,
  nbaHasScore,
  latestNbaObservations,
  nbaFreshness,
  nbaOutcomes,
  nbaSource,
  type NbaGame,
  type NbaObservation,
} from "@/lib/nba-board";
import "@/app/nba-board.css";

const stamp = (s: string | null) => {
  const d = new Date(s || "");
  return Number.isFinite(d.getTime())
    ? d.toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }) + " ET"
    : "Unknown";
};
function Source({ url }: { url: string }) {
  const href = nbaSource(url);
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      Source ↗
    </a>
  ) : (
    <span>Source unavailable</span>
  );
}
export default function NbaGameBoard() {
  const [games, setGames] = useState<NbaGame[]>([]),
    [access, setAccess] = useState<Access>(noAccess);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [recent, setRecent] = useState(false),
    [limit, setLimit] = useState(12);
  const [now, setNow] = useState(Date.now());
  const [epoch, setEpoch] = useState(0);
  const version = useRef(0);
  useEffect(() => {
    let live = true,
      busy = false;
    async function refresh() {
      if (busy || document.visibilityState === "hidden") return;
      busy = true;
      const token = ++version.current;
      try {
        const at = Date.now();
        const [g, a] = await Promise.all([
          supabase
            .from("nba_games")
            .select(
              "id,provider_id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season,season_type,status,away_score,home_score,source,updated_at",
            )
            .gte("tipoff", new Date(at - 86400000).toISOString())
            .lte("tipoff", new Date(at + 7 * 86400000).toISOString())
            .order("tipoff")
            .order("id")
            .limit(150),
          supabase.rpc("membership_status"),
        ]);
        if (!live || token !== version.current) return;
        if (g.error) throw g.error;
        setGames(g.data || []);
        setAccess(a.error ? noAccess : a.data);
        setNow(at);
        setError(
          a.error
            ? "Schedule loaded. Member source access could not be checked; retry to load details."
            : "",
        );
      } catch {
        if (live && token === version.current) {
          setAccess(noAccess);
          setError(
            "The NBA schedule could not refresh. Any retained rows may be out of date.",
          );
        }
      } finally {
        if (live && token === version.current) setLoading(false);
        busy = false;
      }
    }
    void refresh();
    const stop = onUserChange(() => {
      ++version.current;
      setGames([]);
      setAccess(noAccess);
      setLoading(true);
      setEpoch((e) => e + 1);
    });
    const focus = () => void refresh();
    const timer = setInterval(focus, 60000);
    window.addEventListener("focus", focus);
    return () => {
      live = false;
      ++version.current;
      stop();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [epoch]);
  const visible = games.filter((g) =>
    recent
      ? /FINAL|CANCEL|POSTPON/.test(g.status || "")
      : !/FINAL|CANCEL|POSTPON/.test(g.status || ""),
  );
  return (
    <section className="nba-live-board" aria-labelledby="nba-board-title">
      <header>
        <div>
          <span className="eyebrow">NBA · SOURCE BOARD</span>
          <h2 id="nba-board-title">Games & market research</h2>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => {
            setLoading(true);
            setEpoch((e) => e + 1);
          }}
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>
      <p className="nba-board-note">
        Preseason and regular-season games are labeled separately. Source
        snapshots are research, not picks.
      </p>
      <div className="nba-board-tabs" aria-label="NBA game window">
        <button
          type="button"
          aria-pressed={!recent}
          onClick={() => {
            setRecent(false);
            setLimit(12);
          }}
        >
          Upcoming & live
        </button>
        <button
          type="button"
          aria-pressed={recent}
          onClick={() => {
            setRecent(true);
            setLimit(12);
          }}
        >
          Recent finals & changes
        </button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {loading && !games.length && <p role="status">Loading NBA games…</p>}
      {!loading && !visible.length && (
        <p className="nba-board-empty">
          {recent
            ? "No recent final or changed games received."
            : "No upcoming NBA games have been received yet. The source connection is still being verified."}{" "}
          No demonstration games are shown.
        </p>
      )}
      <div className="nba-board-games">
        {visible.slice(0, limit).map((g) => (
          <article className="nba-board-game" key={`${epoch}-${g.id}`}>
            <div className="nba-board-meta">
              <span>{nbaPhase(g.season_type)}</span>
              <strong>{nbaStatus(g, now)}</strong>
            </div>
            <h3>
              {g.away_team}
              <span> @ </span>
              {g.home_team}
            </h3>
            {nbaHasScore(g) && (
              <p className="nba-board-score">
                {g.away_abbreviation || g.away_team} {g.away_score} ·{" "}
                {g.home_abbreviation || g.home_team} {g.home_score}
              </p>
            )}
            <p>
              {g.tipoff_tbd ? "Tip time TBD" : stamp(g.tipoff)} ·{" "}
              {g.venue || "Venue unknown"}
            </p>
            <small>
              Schedule received {stamp(g.updated_at)} ·{" "}
              {nbaFreshness(g.updated_at, now, 45)}
            </small>
            <div className="nba-board-source">
              <Source url={g.source} />
            </div>
            {access.allowed ? (
              <NbaGameDetails game={g} now={now} />
            ) : (
              <p className="nba-board-note">
                <Link href="/membership">Sign in with research access</Link> for
                available injury and sportsbook snapshots.
              </p>
            )}
          </article>
        ))}
      </div>
      {visible.length > limit && (
        <button
          className="secondary"
          type="button"
          onClick={() => setLimit((l) => l + 12)}
        >
          Show more games
        </button>
      )}
    </section>
  );
}
function NbaGameDetails({ game, now }: { game: NbaGame; now: number }) {
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<NbaObservation[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const r = await supabase
          .from("nba_observations")
          .select(
            "id,game_id,kind,provider,source,observed_at,recorded_at,payload",
          )
          .eq("game_id", game.id)
          .in("kind", ["injury", "odds"])
          .gte("recorded_at", new Date(Date.now() - 48 * 3600000).toISOString())
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(180);
        if (!live) return;
        if (r.error) throw r.error;
        setRows(latestNbaObservations(r.data || []));
      } catch {
        if (live) {
          setRows([]);
          setError(
            "These member sources could not load. Retry or check your research access.",
          );
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [game.id, open, retry, now]);
  const injuries = rows.filter((r) => r.kind === "injury"),
    odds = rows.filter((r) => r.kind === "odds");
  return (
    <details
      className="nba-board-details"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Injuries & sportsbook snapshots</summary>
      {open && (
        <div>
          {loading && <p role="status">Loading source snapshots…</p>}
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                type="button"
                className="text-link"
                onClick={() => setRetry((n) => n + 1)}
              >
                Retry
              </button>
            </p>
          )}
          {!loading && !error && (
            <>
              <h4>Reported injuries</h4>
              <p className="nba-board-note">
                Reported items are not final availability. Missing from this
                list is not clearance; older reports may have changed.
              </p>
              {!injuries.length && (
                <p>No recent injury observations received for this game.</p>
              )}
              {injuries.map((r) => (
                <div className="nba-board-observation" key={r.id}>
                  <strong>
                    {String(r.payload.player || "Player unknown")} ·{" "}
                    {String(r.payload.status || "Status unknown")}
                  </strong>
                  <p>
                    {String(r.payload.team || "")}
                    {r.payload.injury ? " · " + String(r.payload.injury) : ""}
                  </p>
                  <small>
                    {r.provider} · Provider time {stamp(r.observed_at)} ·
                    Received {stamp(r.recorded_at)} ·{" "}
                    {nbaFreshness(r.observed_at, now, 1440)}
                  </small>{" "}
                  <Source url={r.source} />
                </div>
              ))}
              <h4>Observed game lines</h4>
              <p className="nba-board-note">
                Exact book and provider time stay attached to each snapshot. No
                executable current price, best-price claim or model edge is
                implied.
              </p>
              {!odds.length && (
                <p>
                  No sportsbook game-line snapshots received for this game.
                  Coverage may not open until closer to tip.
                </p>
              )}
              {odds.map((r) => (
                <div className="nba-board-observation" key={r.id}>
                  <strong>
                    {String(r.payload.book || "Book unknown")} ·{" "}
                    {(
                      {
                        h2h: "Moneyline",
                        spreads: "Spread",
                        totals: "Total",
                      } as Record<string, string>
                    )[String(r.payload.market)] ||
                      String(r.payload.market || "Market unknown")}
                  </strong>
                  {nbaOutcomes(r.payload).length ? (
                    <ul>
                      {nbaOutcomes(r.payload).map((o, i) => (
                        <li key={i}>
                          {o.name}
                          {o.point !== null
                            ? " " +
                              (o.point > 0 && r.payload.market === "spreads"
                                ? "+"
                                : "") +
                              o.point
                            : ""}{" "}
                          · {o.price}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No available outcomes in this snapshot.</p>
                  )}
                  <small>
                    Provider time {stamp(r.observed_at)} · Received{" "}
                    {stamp(r.recorded_at)} ·{" "}
                    {nbaFreshness(r.observed_at, now, 180)}
                  </small>{" "}
                  <Source url={r.source} />
                </div>
              ))}
              <p className="nba-board-note">
                Latest received records from a bounded 48-hour window. This list
                is not a complete historical ledger or a medical clearance
                service.
              </p>
            </>
          )}
        </div>
      )}
    </details>
  );
}
