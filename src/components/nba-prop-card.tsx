"use client";
import { useMemo, useState } from "react";
import { nbaWhen } from "@/lib/nba-home";
import {
  filterPropGames,
  hitRate,
  matchupFor,
  projectedMinutes,
  propEstimate,
  propGames,
  restDays,
  type DefenseRow,
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
const POS = { G: "guards", F: "forwards", C: "centers" } as Record<
  string,
  string
>;
const ordinal = (n: number) =>
  `${n}${[11, 12, 13].includes(n % 100) ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
/** The book's over chance with the vig removed, when both sides are quoted. */
function fairOver(over: number | null, under: number | null) {
  if (over == null || under == null) return null;
  const p = (o: number) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  return Math.round((p(over) / (p(over) + p(under))) * 100);
}

/**
 * One FanDuel prop against the player's recorded games: our estimate and projection, projected
 * minutes, a bar per game with the line drawn across, minutes and usage per game, hit rates over the
 * last 5, 10 and 20 games and the season, Home/Away and rest filters, and how tonight's defense
 * treats his position. Recorded box scores only; the estimate is research, not a pick.
 */
export default function NbaPropCard({
  trend,
  player,
  defense,
  tonight,
  book = "FanDuel",
}: {
  trend: PropTrend;
  player: PlayerLine;
  defense: DefenseRow[];
  /** The book whose over/under prices are shown. */
  book?: string;
  tonight: { tipoff: string; home: boolean; opponent: string; defense: string };
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
  const matchup = matchupFor(
    defense,
    tonight.defense,
    player.position,
    trend.market,
  );
  const projMin = projectedMinutes(player.games, tonightRest);
  const estimate = propEstimate(
    player.games,
    trend.market,
    trend.line,
    projMin,
    matchup?.factor,
  );
  const fair = fairOver(trend.over, trend.under);
  const usages = bars.filter((g) => g.usage != null);
  const usageTop = Math.max(...usages.map((g) => g.usage!), 1);
  const avgUsage = usages.length
    ? usages.reduce((a, g) => a + g.usage!, 0) / usages.length
    : null;

  return (
    <div className="npc" aria-label={`${trend.player} ${STAT[trend.market]}`}>
      <header className="npc-head">
        <div>
          <b>
            Over {trend.line} {STAT[trend.market]}
          </b>
          <small>
            {book} {odds(trend.over)} / under {odds(trend.under)} ·{" "}
            {tonight.home ? "vs" : "@"} {tonight.opponent}
          </small>
        </div>
        <div className="npc-rate">
          <b>{estimate ? `${estimate.chance}%` : "—"}</b>
          <small>
            {estimate
              ? `our estimate · projecting ${estimate.projection}`
              : "estimate needs 5 games"}
          </small>
        </div>
      </header>

      <div className="npc-chips">
        {projMin != null ? (
          <span className="npc-chip">
            <b>{projMin.toFixed(1)}</b> proj min
          </span>
        ) : null}
        {fair != null ? (
          <span className="npc-chip">
            {book} implies <b>{fair}%</b>
          </span>
        ) : null}
        {matchup ? (
          <span className={`npc-chip npc-${matchup.label.toLowerCase()}`}>
            {matchup.label} matchup
          </span>
        ) : null}
      </div>

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
          <p className="npc-cleared">
            <b>{shown ? `${shown.pct}%` : "—"}</b> cleared {trend.line}
            {shown ? ` · ${shown.hits} of ${shown.n} games` : ""}
            {filtered ? " · filtered" : ""}
          </p>
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
          <div className="npc-panels">
            <div className="npc-minutes" aria-label="Minutes played">
              <p>
                Minutes{" "}
                <span>
                  avg {Math.round(avgMin)}
                  {projMin != null ? (
                    <>
                      {" "}
                      · <b>proj {Math.round(projMin)}</b>
                    </>
                  ) : null}
                </span>
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
            <div className="npc-minutes" aria-label="Usage rate">
              <p>
                Usage{" "}
                <span>
                  {avgUsage != null ? `avg ${avgUsage.toFixed(1)}%` : "pending"}
                </span>
              </p>
              {usages.length ? (
                <div>
                  {bars.map((g, i) => (
                    <span key={`${g.at}-u-${i}`}>
                      {g.usage != null ? (
                        <>
                          <i
                            style={{
                              height: `${(g.usage / usageTop) * 100}%`,
                            }}
                          />
                          <em>{Math.round(g.usage)}</em>
                        </>
                      ) : null}
                    </span>
                  ))}
                </div>
              ) : (
                <small className="npc-pending">
                  Shows once shot attempts are recorded for these games.
                </small>
              )}
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
      {matchup ? (
        <section className="npc-dvp" aria-label="Defense vs position">
          <p>
            <b>Defense vs position</b>
            <span>
              {tonight.opponent} vs {POS[matchup.pos] ?? matchup.pos},{" "}
              {STAT[trend.market]}
            </span>
          </p>
          <p className="npc-dvp-rank">
            <span className={`npc-${matchup.label.toLowerCase()}`}>
              {matchup.label} matchup
            </span>
            <b>
              {ordinal(matchup.rank)} / {matchup.of}
            </b>
          </p>
          <div
            className="npc-gauge"
            role="img"
            aria-label={`Ranked ${matchup.rank} of ${matchup.of}; 1 allows the least`}
          >
            <i style={{ width: `${(matchup.rank / matchup.of) * 100}%` }} />
          </div>
          <p className="npc-gauge-ends">
            <span>Strong</span>
            <span>
              allows {matchup.allowed.toFixed(1)} a game · league{" "}
              {matchup.league.toFixed(1)}
            </span>
            <span>Weak</span>
          </p>
        </section>
      ) : null}

      <p className="nbar-note">
        Our estimate: his per-minute {STAT[trend.market]} (season and last 10)
        times projected minutes, adjusted for tonight&rsquo;s defense against
        his position, with the spread of his own games. From our recorded box
        scores; research, not a pick.
      </p>
    </div>
  );
}
