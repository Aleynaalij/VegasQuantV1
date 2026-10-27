"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { noAccess, type Access } from "@/lib/membership";
import { nbaCanonicalTeam } from "@/lib/nba-home";
import {
  nbaComparisons,
  nbaMarkets,
  nbaOdds,
  nbaPhase,
  nbaStatus,
  nbaHasScore,
  latestNbaObservations,
  nbaFreshness,
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
            <small>Schedule last changed {stamp(g.updated_at)}</small>
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
export function NbaGameDetails({
  game,
  now,
  defaultOpen = false,
}: {
  game: NbaGame;
  now: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen),
    [rows, setRows] = useState<NbaObservation[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [retry, setRetry] = useState(0);
  const [shown, setShown] = useState(20);
  const [market, setMarket] = useState("all"),
    [search, setSearch] = useState("");
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
          .in("kind", ["injury", "odds", "prop"])
          .gte("recorded_at", new Date(Date.now() - 48 * 3600000).toISOString())
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(500);
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
  const injuries = rows.filter((r) => r.kind === "injury");
  const comparisons = nbaComparisons(rows, now);
  const filtered = comparisons.filter(
    (c) =>
      (market === "all" || c.market === market) &&
      `${c.player} ${c.side}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <details
      className="nba-board-details"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Open research · lines, props & form</summary>
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
              <h4>Compare observed prices</h4>
              <p className="nba-board-note">
                Research only · not picks. Best observed compares identical
                selections from available books with provider quotes at most 15
                minutes old. Prices can change; this is not a live bet slip.
              </p>
              <div className="nba-research-filters">
                <label>
                  Market
                  <select
                    aria-label="Market"
                    value={market}
                    onChange={(e) => (setMarket(e.target.value), setShown(20))}
                  >
                    <option value="all">All markets</option>
                    {Object.entries(nbaMarkets).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Player or team
                  <input
                    type="search"
                    aria-label="Player or team"
                    placeholder="Search research"
                    value={search}
                    onChange={(e) => (setSearch(e.target.value), setShown(20))}
                  />
                </label>
              </div>
              {!comparisons.length && (
                <p>
                  No sportsbook lines or player props received for this game
                  yet. Coverage opens closer to tip.
                </p>
              )}
              {!!comparisons.length && !filtered.length && (
                <p>No selections match these filters.</p>
              )}
              {filtered.slice(0, shown).map((c) => (
                <article className="nba-price-card" key={c.key}>
                  <span className="eyebrow">{nbaMarkets[c.market]}</span>
                  <h4>{c.player || c.side}</h4>
                  <p>
                    {c.player ? c.side + " " : ""}
                    {c.point !== null ? c.point : "Moneyline"}
                  </p>
                  <strong>
                    {c.best === null
                      ? "No fresh comparable price"
                      : "Best observed " + nbaOdds(c.best)}
                  </strong>
                  <ul className="nba-book-quotes">
                    {c.quotes.map((q) => (
                      <li key={q.book}>
                        <b>
                          {q.book} {nbaOdds(q.price)}
                          {q.fresh && q.price === c.best
                            ? " · Best observed"
                            : ""}
                        </b>
                        <small>
                          Provider {stamp(q.observed_at)} · Received{" "}
                          {stamp(q.recorded_at)} ·{" "}
                          {q.fresh
                            ? "Within 15 min"
                            : "Older / unverified snapshot"}
                        </small>
                        <Source url={q.source} />
                      </li>
                    ))}
                  </ul>
                  {/FINAL/.test(game.status || "") && (
                    <NbaObservedGrade
                      game={game.id}
                      market={c.market}
                      side={c.side}
                      point={c.point}
                      player={c.player}
                    />
                  )}
                  {c.player && (
                    <NbaPlayerForm
                      key={`${c.player}-${game.id}`}
                      player={c.player}
                      game={game}
                    />
                  )}
                </article>
              ))}
              {filtered.length > shown && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShown((n) => n + 20)}
                >
                  Show more selections
                </button>
              )}
              <p className="nba-board-note">
                Latest received records from a bounded 48-hour window (up to 500
                observations). Available books only; missing books are not
                compared. This list is not a complete historical ledger or a
                medical clearance service.
              </p>
            </>
          )}
        </div>
      )}
    </details>
  );
}

function NbaPlayerForm({ player, game }: { player: string; game: NbaGame }) {
  const [open, setOpen] = useState(false),
    [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  type FormRow = {
    game_id: string;
    athlete_id: string;
    player: string;
    played: boolean;
    minutes: number | null;
    points: number;
    rebounds: number;
    assists: number;
    threes: number;
    date: string;
    source: string;
  };
  const [form, setForm] = useState<FormRow[]>([]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      setForm([]);
      try {
        if (game.season === null || game.season_type === null)
          throw new Error("Season phase unavailable");
        const key = await supabase.rpc("nba_name_key", { n: player });
        if (key.error || !key.data)
          throw new Error("Player identity unavailable");
        // Filter by game time, not recording time: late confirmation cannot leak future games.
        const players = await supabase
          .from("nba_player_results")
          .select(
            "game_id,athlete_id,player,played,minutes,points,rebounds,assists,threes,nba_game_results!inner(source_url,nba_games!inner(tipoff,season,season_type))",
          )
          .eq("name_key", key.data)
          .eq("nba_game_results.nba_games.season", game.season)
          .eq("nba_game_results.nba_games.season_type", game.season_type)
          .lt("nba_game_results.nba_games.tipoff", game.tipoff)
          .gte(
            "nba_game_results.nba_games.tipoff",
            new Date(Date.parse(game.tipoff) - 60 * 86400000).toISOString(),
          )
          .order("game_id")
          .limit(200);
        if (players.error) throw players.error;
        if ((players.data || []).length === 200)
          throw new Error("Player history exceeded safe window");
        if (new Set((players.data || []).map((p) => p.athlete_id)).size > 1)
          throw new Error("Ambiguous player identity");
        const ids = (players.data || []).map((p) => p.game_id);
        if (!ids.length) {
          if (live) setForm([]);
          return;
        }
        const progress = await supabase
          .from("nba_result_progress")
          .select("game_id,status")
          .in("game_id", ids)
          .limit(200);
        if (progress.error) throw progress.error;
        const confirmed = new Set(
          (progress.data || [])
            .filter((p) => p.status === "FINAL")
            .map((p) => p.game_id),
        );
        const result = (players.data || [])
          .filter((p) => confirmed.has(p.game_id))
          .map((p) => {
            const meta = p.nba_game_results as unknown as {
              source_url: string;
              nba_games: { tipoff: string };
            };
            return {
              ...p,
              date: meta.nba_games.tipoff,
              source: meta.source_url,
            };
          })
          .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
          .slice(0, 5);
        if (live) setForm(result);
      } catch {
        if (live)
          setError(
            "Recorded form could not load or player identity is ambiguous. No form estimate is shown.",
          );
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [open, retry, player, game.season, game.season_type, game.tipoff]);
  return (
    <details
      className="nba-form"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Recent recorded form · {player}</summary>
      {open && (
        <div>
          <p className="nba-board-note">
            Up to five confirmed games from the prior 60 days, same season and
            phase only. Partial recorded history, not a last-five season sample
            or a prediction. Conflicted and unconfirmed results are excluded.
            Minutes are rounded by the result provider.
          </p>
          {loading && <p role="status">Loading recorded form…</p>}
          {error && (
            <p role="alert">
              {error}{" "}
              <button type="button" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
          {!loading && !error && !form.length && (
            <p>
              No confirmed {nbaPhase(game.season_type).toLowerCase()} results
              recorded for this player yet.
            </p>
          )}
          {form.map((r) => (
            <div className="nba-form-row" key={r.game_id}>
              <b>{stamp(r.date)}</b>
              <span>
                {r.played
                  ? `${r.points} PTS · ${r.rebounds} REB · ${r.assists} AST · ${r.threes} 3PM · ${r.minutes ?? "?"} MIN`
                  : "Did not play"}
              </span>
              <Source url={r.source} />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function NbaObservedGrade({
  game,
  market,
  side,
  point,
  player,
}: {
  game: string;
  market: string;
  side: string;
  point: number | null;
  player: string;
}) {
  const [grade, setGrade] = useState(""),
    [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    try {
      const r = await supabase.rpc("nba_grade", {
        p_game: game,
        p_market: market,
        p_side: nbaCanonicalTeam(side),
        p_point: point,
        p_player: player || null,
      });
      setGrade(
        r.error
          ? "Result unavailable"
          : (
              {
                WIN: "WIN",
                LOSS: "LOSS",
                PUSH: "PUSH",
                VOID: "VOID",
                PENDING: "Awaiting confirmed result",
                REVIEW: "Result under review",
              } as Record<string, string>
            )[String(r.data)] || "Result unavailable",
      );
    } catch {
      setGrade("Result unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="nba-observed-grade">
      <button
        type="button"
        className="secondary"
        disabled={busy}
        onClick={check}
      >
        {busy ? "Checking…" : "Check final result"}
      </button>
      {grade && (
        <p role="status">{grade} · observed selection, not a published pick</p>
      )}
    </div>
  );
}
