export type Metric =
  | "rushing_yards"
  | "receiving_yards"
  | "passing_yards"
  | "receptions";
export type Contract = {
  leg_key: string;
  game_id: string;
  player: string;
  team: string;
  metric: Metric;
  threshold: number;
  operator: "gte" | "over" | "under";
  period: "full_game";
  market: string;
};
export type Game = {
  id: string;
  provider_id: string;
  home_team: string;
  away_team: string;
  home_abbreviation: string;
  away_abbreviation: string;
  kickoff: string;
  season: number;
  week: number;
};
export const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]/g, "");
const playerName = (s: string) =>
  normal(s.replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, ""));
export function contractFor(
  c: any,
  key: string,
  games: Game[],
  publishedAt: string,
  expiresAt: string,
): Contract | string {
  if (c.fun_play || c.legs || /^RETROSPECTIVE/.test(c.analysis_kind || ""))
    return "Ticket/retrospective requires review";
  // Only explicit full-game single-player stats. No guessing period or market semantics.
  const m =
    /^Full game\s*·\s*(?:(\d+)\+|(Over|Under)\s+(\d+(?:\.\d+)?))\s+(rushing yards|receiving yards|passing yards|receptions)$/i.exec(
      c.market || "",
    );
  if (!m || !c.name || !c.team)
    return "Unsupported market, period or missing player/team";
  const metric = (
    {
      "rushing yards": "rushing_yards",
      "receiving yards": "receiving_yards",
      "passing yards": "passing_yards",
      receptions: "receptions",
    } as const
  )[m[4].toLowerCase() as "receptions"];
  const eventIds = (c.sources || []).flatMap((s: any) => {
    try {
      const u = new URL(s.url);
      if (u.hostname !== "www.espn.com") return [];
      const id = /\/gameId\/(\d+)/.exec(u.pathname)?.[1];
      return id ? [id] : [];
    } catch {
      return [];
    }
  });
  const candidates = games.filter((g) => {
    if (c.game_id && g.id !== c.game_id) return false;
    if (eventIds.length && !eventIds.includes(g.provider_id)) return false;
    if (![g.away_team, g.home_team].some((t) => normal(t) === normal(c.team)))
      return false;
    const kick = Date.parse(g.kickoff),
      pub = Date.parse(publishedAt),
      end = Date.parse(expiresAt);
    return (
      pub <= kick + 4 * 3600000 &&
      pub >= kick - 7 * 86400000 &&
      end >= kick &&
      end <= kick + 12 * 3600000
    );
  });
  if (candidates.length !== 1) return "Game binding missing or ambiguous";
  const g = candidates[0];
  return {
    leg_key: key,
    game_id: g.id,
    player: c.name,
    team: c.team,
    metric,
    threshold: Number(m[1] || m[3]),
    operator: m[1] ? "gte" : m[2].toLowerCase() === "over" ? "over" : "under",
    period: "full_game",
    market: c.market,
  };
}
export function compare(
  value: number,
  c: Pick<Contract, "threshold" | "operator">,
): "WIN" | "LOSS" | "PUSH" {
  if (c.operator === "gte") return value >= c.threshold ? "WIN" : "LOSS";
  if (value === c.threshold) return "PUSH";
  return (c.operator === "over" ? value > c.threshold : value < c.threshold)
    ? "WIN"
    : "LOSS";
}
export function espnStat(
  data: any,
  g: Game,
  c: Contract,
): { value: number; final: boolean; athlete_id: string } | string {
  const competition = data.header?.competitions?.[0];
  if (
    String(data.header?.id) !== g.provider_id ||
    data.header?.season?.year !== g.season ||
    data.header?.season?.type !== 2
  )
    return "ESPN event/season mismatch";
  if (
    !competition?.date ||
    Math.abs(Date.parse(competition.date) - Date.parse(g.kickoff)) > 3 * 3600000
  )
    return "ESPN kickoff mismatch";
  const teams = competition?.competitors || [];
  if (
    !teams.some(
      (t: any) =>
        t.homeAway === "home" &&
        normal(t.team?.displayName || "") === normal(g.home_team),
    ) ||
    !teams.some(
      (t: any) =>
        t.homeAway === "away" &&
        normal(t.team?.displayName || "") === normal(g.away_team),
    )
  )
    return "ESPN teams mismatch";
  const groupName =
    c.metric === "passing_yards"
      ? "passing"
      : c.metric === "rushing_yards"
        ? "rushing"
        : "receiving";
  const field = {
    passing_yards: "passingYards",
    rushing_yards: "rushingYards",
    receiving_yards: "receivingYards",
    receptions: "receptions",
  }[c.metric];
  const found: { value: number; final: boolean; athlete_id: string }[] = [];
  for (const team of data.boxscore?.players || []) {
    if (normal(team.team?.displayName || "") !== normal(c.team)) continue;
    for (const group of team.statistics || []) {
      if (group.name !== groupName) continue;
      const i = group.keys?.indexOf(field);
      if (i == null || i < 0) continue;
      for (const athlete of group.athletes || []) {
        if (
          playerName(athlete.athlete?.displayName || "") !==
          playerName(c.player)
        )
          continue;
        const raw = athlete.stats?.[i];
        if (typeof raw !== "string" || !/^[-]?\d+$/.test(raw)) continue;
        found.push({
          value: Number(raw),
          final:
            competition.status?.type?.completed === true &&
            competition.status?.type?.state === "post",
          athlete_id: String(athlete.athlete.id),
        });
      }
    }
  }
  return found.length === 1
    ? found[0]
    : "Player stat unavailable or ambiguous; no zero assumed";
}
export function csvRows(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" && !quoted) {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (quoted) throw Error("Truncated CSV");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }
  const header = rows.shift() || [];
  for (const k of [
    "player_display_name",
    "season",
    "week",
    "season_type",
    "team",
    "opponent_team",
    "game_id",
    "rushing_yards",
    "receiving_yards",
    "passing_yards",
    "receptions",
  ])
    if (!header.includes(k)) throw Error(`Missing nflverse column ${k}`);
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((k, i) => [k, r[i]])));
}
const teamCode = (s: string) => (s === "LAR" ? "LA" : s === "WSH" ? "WAS" : s);
export function weeklyStat(
  rows: Record<string, string>[],
  g: Game,
  c: Contract,
): { value: number; game_id: string; player_id: string } | string {
  const own = teamCode(
      c.team === g.home_team ? g.home_abbreviation : g.away_abbreviation,
    ),
    opp = teamCode(
      c.team === g.home_team ? g.away_abbreviation : g.home_abbreviation,
    );
  const found = rows.filter(
    (r) =>
      r.season === String(g.season) &&
      r.week === String(g.week) &&
      r.season_type === "REG" &&
      r.team === own &&
      r.opponent_team === opp &&
      playerName(r.player_display_name) === playerName(c.player),
  );
  if (found.length !== 1)
    return "nflverse weekly player row unavailable or ambiguous";
  const r = found[0],
    value = r[c.metric];
  if (!/^-?\d+(?:\.0+)?$/.test(value)) return "nflverse stat invalid";
  const parts = r.game_id.split("_");
  if (
    parts.length !== 4 ||
    Number(parts[0]) !== g.season ||
    Number(parts[1]) !== g.week ||
    parts[2] !== teamCode(g.away_abbreviation) ||
    parts[3] !== teamCode(g.home_abbreviation)
  )
    return "nflverse game mismatch";
  return { value: Number(value), game_id: r.game_id, player_id: r.player_id };
}
