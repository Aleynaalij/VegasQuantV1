import {
  compare,
  statNumber,
  playerName,
  teamCode,
  type Contract,
  type Game,
} from "./grade.ts";

export type HistoryGame = {
  season: number;
  week: number;
  opponent: string;
  value: number;
};
export type LegHistory = {
  player_id: string;
  position: string | null;
  games: HistoryGame[];
  cleared: number;
  sample: number;
  median: number | null;
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b),
    m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * How often the player cleared this leg's target in his most recent regular-season games before
 * the game the leg is for (games he played; a missed game has no row and is not a zero).
 * `rows` are nflverse weekly player rows, the current season and optionally the one before.
 */
export function legHistory(
  rows: Record<string, string>[],
  c: Contract,
  g: Game,
  take = 5,
): LegHistory | string {
  const name = playerName(c.player);
  const prior = rows.filter((r) => {
    const season = Number(r.season),
      week = Number(r.week);
    return (
      r.season_type === "REG" &&
      playerName(r.player_display_name) === name &&
      (season < g.season || (season === g.season && week < g.week))
    );
  });
  const ids = [...new Set(prior.map((r) => r.player_id))];
  let id = ids[0];
  if (ids.length > 1) {
    // Two players share the name: keep the one on this leg's team this season.
    const own = c.team
      ? teamCode(
          c.team === g.home_team ? g.home_abbreviation : g.away_abbreviation,
        )
      : null;
    const onTeam = own
      ? ids.filter((i) =>
          prior.some(
            (r) =>
              r.player_id === i &&
              r.team === own &&
              r.season === String(g.season),
          ),
        )
      : [];
    if (onTeam.length !== 1) return "Player history ambiguous";
    id = onTeam[0];
  }
  if (!id) return "No prior games";
  const games = prior
    .filter(
      (r) => r.player_id === id && statNumber(r[c.metric], c.metric) !== null,
    )
    .sort(
      (a, b) =>
        Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week),
    )
    .slice(0, take)
    .map((r) => ({
      season: Number(r.season),
      week: Number(r.week),
      opponent: r.opponent_team,
      value: Number(r[c.metric]),
    }));
  if (!games.length) return "No prior games";
  const latest = prior
    .filter((r) => r.player_id === id)
    .sort(
      (a, b) =>
        Number(b.season) - Number(a.season) || Number(b.week) - Number(a.week),
    )[0];
  return {
    player_id: id,
    position: latest.position || latest.position_group || null,
    games,
    cleared: games.filter((x) => compare(x.value, c) === "WIN").length,
    sample: games.length,
    median: median(games.map((x) => x.value)),
  };
}
