"use client";
import { useMemo, useState } from "react";
import { nbaWhen } from "@/lib/nba-home";
import {
  filterPropGames,
  hitRate,
  propGames,
  restDays,
  type PlayerLine,
  type PropTrend,
  type Rest,
  type Venue,
} from "@/lib/nba-research-tab";

const STAT = { player_points: "points", player_rebounds: "rebounds" } as const;
const BARS = 10;
const odds = (p: number | null) => (p == null ? "" : p > 0 ? `+${p}` : `${p}`);
const short = (iso: string | null) =>
  iso ? nbaWhen(iso, { month: "numeric", day: "numeric" }) : "";

/**
 * One FanDuel prop against the player's recorded games: a bar per game with the line drawn across,
 * hit rates over the last 5, 10 and 20 games and the season, and Home/Away and rest filters.
 * Recorded box scores only; a hit rate is history, not a prediction.
 */
export default function NbaPropCard({
  trend,
  player,
  tonight,
}: {
  trend: PropTrend;
  player: PlayerLine;
  tonight: { tipoff: string; home: boolean; opponent: string };
}) {
  const [venue, setVenue] = useState<Venue>("all");
  const [rest, setRest] = useState<Rest>("any");
  const all = useMemo(
    () => propGames(player, trend.market, trend.line),
    [player, trend.market, trend.line],
  );
  const games = filterPropGames(all, venue, rest);
  const bars = games.slice(0, BARS).reverse();
  const top = Math.max(trend.line * 1.4, ...bars.map((g) => g.value), 1);
  const minTop = Math.max(...bars.map((g) => g.min), 1);
  const tonightRest = restDays(player.games[0]?.at, tonight.tipoff);
  const shown = hitRate(games, BARS);
  const avgMin = bars.length
    ? bars.reduce((a, g) => a + g.min, 0) / bars.length
    : 0;
  const strip: [string, ReturnType<typeof hitRate>][] = [
    ["L5", hitRate(games, 5)],
    ["L10", hitRate(games, 10)],
    ["L20", hitRate(games, 20)],
    ["Season", hitRate(games)],
  ];
  const filtered = venue !== "all" || rest !== "any";

  return (
    <div className="npc" aria-label={`${trend.player} ${STAT[trend.market]}`}>
      <header className="npc-head">
        <div>
          <b>
            Over {trend.line} {STAT[trend.market]}
          </b>
          <small>
            FanDuel {odds(trend.over)} / under {odds(trend.under)} ·{" "}
            {tonight.home ? "vs" : "@"} {tonight.opponent}
          </small>
        </div>
        <div className="npc-rate">
          <b>{shown ? `${shown.pct}%` : "—"}</b>
          <small>
            {shown ? `${shown.hits}/${shown.n} over` : "no games"}
            {filtered ? " · filtered" : ""}
          </small>
        </div>
      </header>

      <div className="npc-filters">
        <div role="group" aria-label="Venue">
          {(["all", "home", "away"] as Venue[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={venue === v}
              onClick={() => setVenue(v)}
            >
              {v}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Days of rest">
          <span>Rest</span>
          {(["any", 0, 1, 2, 3] as Rest[]).map((r) => (
            <button
              key={String(r)}
              type="button"
              aria-pressed={rest === r}
              onClick={() => setRest(r)}
            >
              {r === 3 ? "3+" : r}
            </button>
          ))}
        </div>
        <small>
          Tonight: {tonight.home ? "home" : "away"}
          {tonightRest == null
            ? ""
            : ` · ${tonightRest === 0 ? "back-to-back" : `${tonightRest} day${tonightRest === 1 ? "" : "s"} rest`}`}
        </small>
      </div>

      {bars.length ? (
        <>
          <div
            className="npc-chart"
            role="img"
            aria-label={`Last ${bars.length} games: ${bars.map((g) => g.value).join(", ")} against a line of ${trend.line}`}
          >
            <span
              className="npc-mark"
              style={{ bottom: `${(trend.line / top) * 100}%` }}
            >
              <i>{trend.line}</i>
            </span>
            {bars.map((g, i) => (
              <span
                key={`${g.at}-${i}`}
                className={g.over ? "npc-bar npc-over" : "npc-bar npc-under"}
                style={{ height: `${Math.max(2, (g.value / top) * 100)}%` }}
              >
                <em>{g.value}</em>
              </span>
            ))}
          </div>
          <div className="npc-labels" aria-hidden>
            {bars.map((g, i) => (
              <small key={`${g.at}-l-${i}`}>
                {g.home === false ? "@" : ""}
                {g.opp || "—"}
                <br />
                {short(g.at)}
              </small>
            ))}
          </div>
          <div className="npc-minutes" aria-label="Minutes played">
            <p>
              Minutes <span>avg {Math.round(avgMin)}</span>
            </p>
            <div>
              {bars.map((g, i) => (
                <span key={`${g.at}-m-${i}`}>
                  <i style={{ height: `${(g.min / minTop) * 100}%` }} />
                  <em>{Math.round(g.min)}</em>
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="nbar-note">No recorded games match these filters.</p>
      )}

      <ul className="npc-strip">
        {strip.map(([label, r]) => (
          <li key={label}>
            <small>{label}</small>
            <b
              className={
                r && r.pct >= 60
                  ? "npc-hot"
                  : r && r.pct <= 40
                    ? "npc-cold"
                    : undefined
              }
            >
              {r ? `${r.pct}%` : "—"}
            </b>
            <small>{r ? `${r.hits}/${r.n}` : ""}</small>
          </li>
        ))}
      </ul>
      <p className="nbar-note">
        From our recorded box scores. A hit rate is history, not a prediction.
      </p>
    </div>
  );
}
