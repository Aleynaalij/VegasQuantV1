"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import {
  nhlWatchlist,
  type NhlContextResponse,
  type NhlSkater,
} from "@/lib/nhl-context";
import "./nhl-game-report.css";
const number = (n: number | null) =>
  n === null ? "Unavailable" : n.toFixed(2);
const when = (s: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
function leaders(players: NhlSkater[] | null, by: "goals" | "points") {
  if (!players) return "Awaiting complete box scores";
  const top = Math.max(...players.map((p) => p[by]), 0);
  return top
    ? players
        .filter((p) => p[by] === top)
        .map((p) => `${p.name} (${top})`)
        .join(" · ")
    : "None recorded in this verified window";
}
/** Mounted only when an NHL row opens. Reads saved context; never calls a provider from the UI. */
export default function NhlGameReport({ gameId }: { gameId: string }) {
  const [data, setData] = useState<NhlContextResponse | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true,
      epoch = 0;
    async function load() {
      const n = ++epoch;
      setData(null);
      setError(false);
      try {
        const r = await supabase.rpc("nhl_game_context", { p_game: gameId });
        if (!live || n !== epoch) return;
        if (r.error || !r.data || typeof r.data.state !== "string")
          throw Error("Report unavailable");
        const d = r.data as NhlContextResponse;
        if (
          d.report &&
          (d.report.version !== 1 ||
            d.report.game_id !== gameId ||
            d.report.teams?.length !== 2)
        )
          throw Error("Report mismatch");
        setData(d);
      } catch {
        if (live && n === epoch) setError(true);
      }
    }
    void load();
    const stop = onUserChange(() => {
      ++epoch;
      setData(null);
      void load();
    });
    return () => {
      live = false;
      ++epoch;
      stop();
    };
  }, [gameId, retry]);
  const report = data?.report;
  return (
    <section className="nhl-report" aria-label="NHL matchup report">
      <div className="nhl-report-heading">
        <h3 className="sport-markets-title">NHL matchup report</h3>
        <span>Pregame context</span>
      </div>
      {error ? (
        <p role="alert">
          The NHL report could not load.{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Retry report
          </button>
        </p>
      ) : !data ? (
        <p role="status">Loading NHL context…</p>
      ) : data.state === "denied" ? (
        <p>Sign in with research access to see the NHL report.</p>
      ) : !report ? (
        <p role="status">
          {data.state === "failed"
            ? "The source refresh could not complete. No stats have been substituted."
            : "This report is waiting for verified NHL.com and Rotowire sources. Reports collect within 36 hours of puck drop."}{" "}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Check report
          </button>
        </p>
      ) : (
        <>
          <p className="nhl-report-note">
            Last five completed regular-season team games before this matchup.
            Player leaders use that same team-game window; goalie form uses his
            last five appearances. Shootout deciding goals are excluded from
            scoring rates.
          </p>
          <p className="nhl-report-note">
            Saved {when(data.checked_at || report.generated_at)}.{" "}
            {Date.now() - Date.parse(data.checked_at || report.generated_at) >
            3600000
              ? "This report is over an hour old; verify lineup changes."
              : "Lineups can change before puck drop."}
          </p>
          <div className="nhl-report-teams">
            {report.teams.map((team, i) => {
              const opposite = report.teams[1 - i],
                favorites = nhlWatchlist(data.watchlist, team.roster);
              const goalie = team.goalie,
                goalieStale =
                  goalie &&
                  Date.now() - Date.parse(goalie.source.retrieved_at) > 3600000;
              return (
                <article className="nhl-report-team" key={team.abbreviation}>
                  <h4>{team.name}</h4>
                  <dl className="nhl-report-numbers">
                    <div>
                      <dt>Last {team.games.length || "5"} record · W–L–OTL</dt>
                      <dd>
                        {team.record
                          ? `${team.record.wins}–${team.record.losses}–${team.record.overtimeLosses}`
                          : "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt>Goals for / game</dt>
                      <dd>{number(team.goalsForPerGame)}</dd>
                    </div>
                    <div>
                      <dt>Goals against / game</dt>
                      <dd>{number(team.goalsAgainstPerGame)}</dd>
                    </div>
                    <div>
                      <dt>Opposing goalie’s last-five GAA</dt>
                      <dd>{number(opposite.goalie?.gaa ?? null)}</dd>
                    </div>
                  </dl>
                  <p className="nhl-report-note">
                    {team.games.length}/5 recent games · {team.boxesVerified}/
                    {team.games.length} player box scores verified.{" "}
                    {opposite.goalie
                      ? `Opposing goalie: ${opposite.goalie.name} (${opposite.goalie.status}), ${opposite.goalie.sample} appearances. Verify the source listing below.`
                      : "Opposing goalie not verified."}
                  </p>
                  <h5>Most goals · team’s last {team.games.length || "5"}</h5>
                  <p>{leaders(team.skaters, "goals")}</p>
                  <h5>Most points · team’s last {team.games.length || "5"}</h5>
                  <p>{leaders(team.skaters, "points")}</p>
                  <h5>Starting goalie report</h5>
                  {goalie ? (
                    <>
                      <p>
                        <strong>{goalie.name}</strong> · Rotowire{" "}
                        {goalieStale ? "last reported" : "reports"}{" "}
                        {goalie.status === "confirmed"
                          ? "confirmed"
                          : goalie.status === "expected"
                            ? "expected"
                            : "not confirmed"}
                        {goalieStale ? " · stale listing" : ""}.
                      </p>
                      <p>
                        Last {goalie.sample || "5"} appearances: GAA{" "}
                        <strong>{number(goalie.gaa)}</strong>
                        {goalie.seconds !== null
                          ? ` · ${Math.floor(goalie.seconds / 60)}:${String(goalie.seconds % 60).padStart(2, "0")} played · ${goalie.goalsAgainst} goals against`
                          : " · verified ice time unavailable"}
                        .
                      </p>
                      <p className="nhl-report-note">
                        Lineup checked {when(goalie.source.retrieved_at)}.
                        Confirmation is source-reported, not a guarantee.
                      </p>
                    </>
                  ) : (
                    <p>
                      Starting goalie is not confirmed by a matched source
                      listing.
                    </p>
                  )}
                  <h5>First power-play unit · projected</h5>
                  {team.powerPlay ? (
                    <>
                      <ul className="nhl-report-pp">
                        {team.powerPlay.players.map((p) => (
                          <li key={p.name}>
                            <span>{p.name}</span>
                            <small>{p.position}</small>
                          </li>
                        ))}
                      </ul>
                      <p className="nhl-report-note">
                        Rotowire projected unit, checked{" "}
                        {when(team.powerPlay.source.retrieved_at)}. Goalie
                        confirmation does not confirm the power-play unit.
                      </p>
                    </>
                  ) : (
                    <p>
                      Power-play unit unavailable for this exact matchup/date.
                    </p>
                  )}
                  {!!favorites.length && (
                    <div className="nhl-report-watch">
                      <h5>Your watchlist in this matchup</h5>
                      <ul>
                        {favorites.map((p) => {
                          const form = team.skaters?.find((s) => s.id === p.id);
                          return (
                            <li key={p.id}>
                              <strong>{p.name}</strong>
                              <span>
                                {form
                                  ? `${form.goals} goals · ${form.points} points · ${form.appearances} appearances`
                                  : "No verified appearance data in this window"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                      <p className="nhl-report-note">
                        Personal favorites, not recommendations.
                      </p>
                    </div>
                  )}
                  <details>
                    <summary>Recent games and source notes</summary>
                    {team.games.length ? (
                      <ul className="nhl-report-games">
                        {team.games.map((g) => (
                          <li key={g.id}>
                            <a
                              href={g.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {g.date} · {g.opponent}
                            </a>
                            <span>
                              {g.result} · {g.goalsFor}–{g.goalsAgainst}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>No completed games verified.</p>
                    )}
                    {team.notes.map((n, j) => (
                      <p key={j} className="nhl-report-note">
                        {n}
                      </p>
                    ))}
                  </details>
                </article>
              );
            })}
          </div>
          <details className="nhl-report-sources">
            <summary>NHL.com and Rotowire source details</summary>
            <p>
              <a
                href={report.nhl_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open the official NHL matchup ↗
              </a>
            </p>
            <ul>
              {report.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.url.includes("rotowire")
                      ? "Rotowire lineup"
                      : s.url.includes("boxscore")
                        ? "NHL official box score"
                        : s.url.includes("roster")
                          ? "NHL official roster"
                          : s.url.includes("game-log")
                            ? "NHL official goalie log"
                            : "NHL official team schedule"}
                  </a>
                  <small>Checked {when(s.retrieved_at)}</small>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
