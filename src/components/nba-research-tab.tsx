"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { noAccess, type Access } from "@/lib/membership";
import { nbaNickname, nbaWhen } from "@/lib/nba-home";
import {
  doubleDoubleWatch,
  latestInjuries,
  propQuotes,
  propTrends,
  seasonLines,
  threePointLeaders,
  type BoxRow,
  type Injury,
  type PlayerLine,
  type PropTrend,
} from "@/lib/nba-research-tab";
import { Empty } from "./ui";
import "@/app/nba-research-tab.css";

type Game = {
  id: string;
  away_team: string;
  home_team: string;
  tipoff: string;
  season: number | null;
};
type Observation = {
  game_id: string;
  kind: string;
  recorded_at: string;
  observed_at: string | null;
  payload: Record<string, unknown>;
};
type Slate = {
  games: Game[];
  lines: PlayerLine[];
  injuries: Map<string, Injury[]>;
  trends: Map<string, PropTrend[]>;
  propsAt: string | null;
};
const HOUR = 3600000;
const etDay = (iso: string) =>
  nbaWhen(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
const one = (n: number) => n.toFixed(1);
const STAT = { player_points: "PTS", player_rebounds: "REB" } as const;

/** Every row of a query, 1,000 at a time (the API's page size). */
async function all<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) throw r.error;
    rows.push(...(r.data || []));
    if ((r.data || []).length < 1000) return rows;
  }
}

async function loadSlate(member: boolean): Promise<Slate> {
  const now = Date.now();
  const upcoming = await supabase
    .from("nba_games")
    .select("id,away_team,home_team,tipoff,season")
    .eq("season_type", 2)
    .gte("tipoff", new Date(now - 4 * HOUR).toISOString())
    .lte("tipoff", new Date(now + 36 * HOUR).toISOString())
    .order("tipoff");
  if (upcoming.error) throw upcoming.error;
  // Tonight's slate: every game on the Eastern date of the next game that has not finished.
  const first = (upcoming.data || [])[0];
  const games = first
    ? (upcoming.data || []).filter(
        (g) => etDay(g.tipoff) === etDay(first.tipoff),
      )
    : [];
  if (!games.length)
    return {
      games,
      lines: [],
      injuries: new Map(),
      trends: new Map(),
      propsAt: null,
    };
  const teams = [...new Set(games.flatMap((g) => [g.away_team, g.home_team]))];
  // This season's finished games only, so "season" numbers reset at the season boundary.
  const season = await all<{ id: string; tipoff: string }>((from, to) => {
    const q = supabase
      .from("nba_games")
      .select("id,tipoff")
      .eq("season_type", 2)
      .lt("tipoff", new Date(now).toISOString());
    return (first.season == null ? q : q.eq("season", first.season))
      .order("id")
      .range(from, to);
  });
  const played = new Map(season.map((g) => [g.id, g.tipoff]));
  type Row = Omit<BoxRow, "tipoff"> & { game_id: string };
  const columns =
    "game_id,athlete_id,player,team,played,minutes,points,rebounds,assists,threes";
  // Everyone who has played for tonight's teams, then each of those players' full history (traded
  // players keep the games they played elsewhere); a player's team is the one in his latest game.
  const onTeams = await all<{ athlete_id: string | number }>((from, to) =>
    supabase
      .from("nba_player_results")
      .select("athlete_id")
      .in("team", teams)
      .eq("played", true)
      .order("game_id")
      .order("athlete_id")
      .range(from, to),
  );
  const athletes = [...new Set(onTeams.map((r) => String(r.athlete_id)))];
  const box: Row[] = [];
  const attempts = new Map<string, number>();
  for (let i = 0; i < athletes.length; i += 150) {
    const ids = athletes.slice(i, i + 150);
    for (const a of await all<{
      game_id: string;
      athlete_id: string;
      attempts: number;
    }>((from, to) =>
      supabase
        .from("nba_player_three_attempts")
        .select("game_id,athlete_id,attempts")
        .in("athlete_id", ids)
        .order("game_id")
        .order("athlete_id")
        .range(from, to),
    ))
      attempts.set(`${a.game_id}:${a.athlete_id}`, a.attempts);
    box.push(
      ...(await all<Row>((from, to) =>
        supabase
          .from("nba_player_results")
          .select(columns)
          .in("athlete_id", ids)
          .eq("played", true)
          .order("game_id")
          .order("athlete_id")
          .range(from, to),
      )),
    );
  }
  const lines = seasonLines(
    box
      .filter((r) => played.has(r.game_id))
      .map((r) => ({
        ...r,
        athlete_id: String(r.athlete_id),
        three_attempts:
          attempts.get(`${r.game_id}:${String(r.athlete_id)}`) ?? null,
        tipoff: played.get(r.game_id)!,
      })),
  ).filter((l) => teams.includes(l.team));
  const injuries = new Map<string, Injury[]>();
  const trends = new Map<string, PropTrend[]>();
  let propsAt: string | null = null;
  if (member) {
    // Injury reports and FanDuel props are read separately and in full: other books' quotes would
    // otherwise crowd them out of a single page.
    const observations = (kind: "injury" | "prop") =>
      all<Observation>((from, to) => {
        const q = supabase
          .from("nba_observations")
          .select("game_id,kind,recorded_at,observed_at,payload")
          .in(
            "game_id",
            games.map((g) => g.id),
          )
          .eq("kind", kind);
        return (kind === "prop" ? q.eq("payload->>book", "FanDuel") : q)
          .order("recorded_at", { ascending: false })
          .order("id")
          .range(from, to);
      });
    const rows = [
      ...(await observations("injury")),
      ...(await observations("prop")),
    ];
    for (const injury of latestInjuries(
      rows.filter((r) => r.kind === "injury"),
    ))
      injuries.set(injury.team, [...(injuries.get(injury.team) || []), injury]);
    for (const g of games) {
      const props = rows.filter(
        (r) =>
          r.kind === "prop" &&
          r.game_id === g.id &&
          r.payload?.book === "FanDuel",
      );
      if (props[0] && (!propsAt || props[0].recorded_at > propsAt))
        propsAt = props[0].recorded_at;
      const gameLines = lines.filter(
        (l) => l.team === g.away_team || l.team === g.home_team,
      );
      trends.set(
        g.id,
        propTrends(
          propQuotes(
            props as {
              recorded_at: string;
              payload: Parameters<typeof propQuotes>[0][number]["payload"];
            }[],
          ),
          gameLines,
        ),
      );
    }
  }
  return { games, lines, injuries, trends, propsAt };
}

/** NBA research tab: tonight's slate, injuries, double-double rates and prop trends. Never picks. */
export default function NbaResearchTab() {
  const [slate, setSlate] = useState<Slate | null>(null);
  const [access, setAccess] = useState<Access>(noAccess);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const a = await supabase.rpc("membership_status");
        const status = a.error ? noAccess : (a.data as Access);
        const s = await loadSlate(status.allowed);
        if (!live) return;
        setAccess(status);
        setSlate(s);
        setError("");
      } catch {
        if (live) setError("NBA research could not load. Retry in a moment.");
      }
    }
    void load();
    const stop = onUserChange(() => void load());
    return () => {
      live = false;
      stop();
    };
  }, []);

  if (error)
    return (
      <p className="nbar-note" role="status">
        {error}
      </p>
    );
  if (!slate) return <p className="nbar-note">Loading NBA research…</p>;
  const teams = new Set(slate.games.flatMap((g) => [g.away_team, g.home_team]));
  const watch = doubleDoubleWatch(slate.lines, teams);
  const attempted = threePointLeaders(slate.lines, teams, "tpa");
  const made = threePointLeaders(slate.lines, teams, "tpm");
  const pct = (l: { tpm: number; tpa: number }) =>
    l.tpa ? `${Math.round((100 * l.tpm) / l.tpa)}%` : "0%";
  return (
    <div className="nbar">
      <header className="nbar-head">
        <span className="nbar-badge">Research · not picks</span>
        <h1>NBA research</h1>
        <p>
          Season trends from every box score we have recorded, today’s injury
          reports and FanDuel’s lines side by side. We are not publishing NBA
          picks yet: this is the evidence, and the read is yours.
        </p>
      </header>

      {!slate.games.length ? (
        <Empty title="No NBA games on the board">
          The next slate appears here the day before tip-off.
        </Empty>
      ) : (
        <>
          <section aria-labelledby="nbar-slate">
            <h2 id="nbar-slate">
              Tonight’s slate ·{" "}
              {nbaWhen(slate.games[0].tipoff, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </h2>
            <ul className="nbar-games">
              {slate.games.map((g) => (
                <li key={g.id} className="nbar-game">
                  <p className="nbar-matchup">
                    <b>{nbaNickname(g.away_team)}</b> @{" "}
                    <b>{nbaNickname(g.home_team)}</b>
                    <span>
                      {nbaWhen(g.tipoff, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      ET
                    </span>
                  </p>
                  {access.allowed
                    ? [g.away_team, g.home_team].map((team) => {
                        const list = (slate.injuries.get(team) || []).filter(
                          (i) => i.status !== "Probable",
                        );
                        return (
                          <p key={team} className="nbar-injuries">
                            <span>{nbaNickname(team)}:</span>{" "}
                            {list.length
                              ? list.map((i, n) => (
                                  <span
                                    key={i.player}
                                    className={`nbar-status nbar-status-${i.status === "Out" ? "out" : "gtd"}`}
                                  >
                                    {n ? ", " : ""}
                                    {i.player} ({i.status}
                                    {i.injury ? `, ${i.injury}` : ""})
                                  </span>
                                ))
                              : "no injuries reported"}
                          </p>
                        );
                      })
                    : null}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="nbar-threes">
            <h2 id="nbar-threes">3-point volume</h2>
            <p className="nbar-note">
              Players on tonight’s teams with the most 3s attempted and made per
              game this season (3+ games).
            </p>
            {attempted.length ? (
              <div className="nbar-threes">
                {(
                  [
                    ["Most attempted", attempted, "tpa"],
                    ["Most made", made, "tpm"],
                  ] as const
                ).map(([label, list, key]) => (
                  <div key={key}>
                    <h3>{label}</h3>
                    <ol className="nbar-list">
                      {list.map((p) => (
                        <li key={p.athlete_id}>
                          <span className="nbar-name">
                            <b>{p.player}</b>
                            <small>{nbaNickname(p.team)}</small>
                          </span>
                          <span className="nbar-rate">{one(p[key])}</span>
                          <small className="nbar-line">
                            {one(p.tpm)} made · {one(p.tpa)} att · {pct(p)}
                          </small>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            ) : (
              <p className="nbar-note">
                3-point attempts for tonight’s teams are still being recorded.
              </p>
            )}
          </section>

          <section aria-labelledby="nbar-dd">
            <h2 id="nbar-dd">Double-double watch</h2>
            <p className="nbar-note">
              Players on tonight’s teams with the highest double-double rate
              this season (3+ games).
            </p>
            {watch.length ? (
              <ol className="nbar-list">
                {watch.map((p) => (
                  <li key={p.athlete_id}>
                    <span className="nbar-name">
                      <b>{p.player}</b>
                      <small>{nbaNickname(p.team)}</small>
                    </span>
                    <span className="nbar-rate">
                      {p.dd}/{p.gp}
                    </span>
                    <small className="nbar-line">
                      {one(p.pts)} PTS · {one(p.reb)} REB · {one(p.ast)} AST ·
                      last:{" "}
                      {p.games
                        .slice(0, 3)
                        .map((g) => `${g.pts}/${g.reb}/${g.ast}`)
                        .join("  ")}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="nbar-note">
                No double-doubles recorded yet for tonight’s teams.
              </p>
            )}
          </section>

          <section aria-labelledby="nbar-props">
            <h2 id="nbar-props">Prop trends</h2>
            {!access.allowed ? (
              <Empty title="Members see prop trends and injuries">
                <Link href="/membership">Sign in with research access</Link> to
                compare FanDuel’s lines with each player’s season.
              </Empty>
            ) : (
              <>
                <p className="nbar-note">
                  FanDuel points and rebounds lines
                  {slate.propsAt
                    ? ` as of ${nbaWhen(slate.propsAt, { hour: "numeric", minute: "2-digit" })} ET`
                    : ""}
                  , against how often the player cleared that number. The
                  largest gaps between season average and line come first. A
                  trend is not a prediction.
                </p>
                {slate.games.map((g) => {
                  const list = (slate.trends.get(g.id) || []).slice(0, 6);
                  return (
                    <div key={g.id} className="nbar-props-game">
                      <h3>
                        {nbaNickname(g.away_team)} @ {nbaNickname(g.home_team)}
                      </h3>
                      {list.length ? (
                        <ul className="nbar-list">
                          {list.map((t) => (
                            <li key={`${t.market}-${t.player}-${t.line}`}>
                              <span className="nbar-name">
                                <b>{t.player}</b>
                                <small>{nbaNickname(t.team)}</small>
                              </span>
                              <span className="nbar-prop">
                                {t.line} {STAT[t.market]}
                              </span>
                              <small className="nbar-line">
                                avg {one(t.seasonAvg)} ({t.gap > 0 ? "+" : ""}
                                {one(t.gap)}) · over in last {t.lastN}:{" "}
                                {t.lastHits}/{t.lastN} · season {t.seasonHits}/
                                {t.gp}
                              </small>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="nbar-note">
                          No FanDuel lines yet for this game.
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </section>
        </>
      )}
      <p className="nbar-note nbar-foot">
        Box scores are recorded after each game; injury reports and lines
        refresh in the morning and again before the first tip. Research only: no
        official NBA picks, records or bankroll.
      </p>
    </div>
  );
}
