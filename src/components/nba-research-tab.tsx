"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { noAccess, type Access } from "@/lib/membership";
import NbaLineups from "./nba-lineups";
import NbaPropCard from "./nba-prop-card";
import { nbaNickname, nbaWhen } from "@/lib/nba-home";
import { doubleDoubleWatch, threePointLeaders } from "@/lib/nba-research-tab";
import { loadSlate, type Slate } from "@/lib/nba-tonight";
import { Empty } from "./ui";
import "@/app/nba-research-tab.css";

const one = (n: number) => n.toFixed(1);
const STAT = { player_points: "PTS", player_rebounds: "REB" } as const;

export default function NbaResearchTab() {
  const [slate, setSlate] = useState<Slate | null>(null);
  const [access, setAccess] = useState<Access>(noAccess);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
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
                  {access.allowed ? (
                    <NbaLineups
                      game={{
                        away: g.away_abbreviation,
                        home: g.home_abbreviation,
                        start: g.tipoff,
                        tbd: g.tipoff_tbd,
                      }}
                    />
                  ) : null}
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
                              : "no recent ESPN injury observations received; not player clearance"}
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
                          {list.map((t) => {
                            const key = `${g.id}|${t.market}|${t.athlete_id}|${t.line}`;
                            const isOpen = open === key;
                            const player = slate.lines.find(
                              (l) => l.athlete_id === t.athlete_id,
                            );
                            return (
                              <li
                                key={key}
                                className={isOpen ? "nbar-open" : undefined}
                              >
                                <button
                                  type="button"
                                  className="nbar-row"
                                  aria-expanded={isOpen}
                                  onClick={() => setOpen(isOpen ? null : key)}
                                >
                                  <span className="nbar-name">
                                    <b>{t.player}</b>
                                    <small>{nbaNickname(t.team)}</small>
                                  </span>
                                  <span className="nbar-prop">
                                    {t.line} {STAT[t.market]}
                                  </span>
                                  <small className="nbar-line">
                                    avg {one(t.seasonAvg)} (
                                    {t.gap > 0 ? "+" : ""}
                                    {one(t.gap)}) · over in last {t.lastN}:{" "}
                                    {t.lastHits}/{t.lastN} · season{" "}
                                    {t.seasonHits}/{t.gp}
                                    <span className="nbar-more" aria-hidden>
                                      {isOpen ? "Hide" : "Game log"}
                                    </span>
                                  </small>
                                </button>
                                {isOpen && player ? (
                                  <NbaPropCard
                                    trend={t}
                                    player={player}
                                    defense={slate.defense}
                                    tonight={{
                                      tipoff: g.tipoff,
                                      home: t.team === g.home_team,
                                      defense:
                                        t.team === g.home_team
                                          ? g.away_team
                                          : g.home_team,
                                      opponent:
                                        t.team === g.home_team
                                          ? g.away_abbreviation ||
                                            nbaNickname(g.away_team)
                                          : g.home_abbreviation ||
                                            nbaNickname(g.home_team),
                                    }}
                                  />
                                ) : null}
                              </li>
                            );
                          })}
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
