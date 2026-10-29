/** NBA research tab: season lines from recorded box scores, injuries and FanDuel prop trends. Research only. */

export type BoxRow = {
  athlete_id: string;
  player: string;
  team: string;
  played: boolean;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  threes?: number | null;
  /** Null until the game's 3-point attempts are recorded. */
  three_attempts?: number | null;
  tipoff: string;
};
export type GameStat = { pts: number; reb: number; ast: number; min: number };
export type PlayerLine = {
  athlete_id: string;
  player: string;
  team: string;
  gp: number;
  min: number;
  pts: number;
  reb: number;
  ast: number;
  dd: number;
  /** 3s made and attempted per game, over the games with recorded attempts (tpaGames). */
  tpm: number;
  tpa: number;
  tpaGames: number;
  /** Games played, most recent first. */
  games: GameStat[];
};

const avg = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const isDoubleDouble = (g: GameStat) =>
  [g.pts, g.reb, g.ast].filter((v) => v >= 10).length >= 2;

/** Case, accents, punctuation and Jr/Sr/II-IV ignored; hyphens count as spaces (Karl-Anthony = Karl Anthony). */
export function nameKey(name: string) {
  return (name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z ]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** One line per player from games they played; their team is the one in their latest game. */
export function seasonLines(rows: BoxRow[]): PlayerLine[] {
  const by = new Map<string, BoxRow[]>();
  for (const r of rows) {
    if (!r.played) continue;
    const list = by.get(r.athlete_id) || [];
    list.push(r);
    by.set(r.athlete_id, list);
  }
  return [...by.values()].map((list) => {
    list.sort((a, b) => Date.parse(b.tipoff) - Date.parse(a.tipoff));
    const games = list.map((r) => ({
      pts: r.points ?? 0,
      reb: r.rebounds ?? 0,
      ast: r.assists ?? 0,
      min: r.minutes ?? 0,
    }));
    const shot = list.filter((r) => r.three_attempts != null);
    return {
      athlete_id: list[0].athlete_id,
      player: list[0].player,
      team: list[0].team,
      gp: games.length,
      min: avg(games.map((g) => g.min)),
      pts: avg(games.map((g) => g.pts)),
      reb: avg(games.map((g) => g.reb)),
      ast: avg(games.map((g) => g.ast)),
      dd: games.filter(isDoubleDouble).length,
      tpm: avg(shot.map((r) => r.threes ?? 0)),
      tpa: avg(shot.map((r) => r.three_attempts!)),
      tpaGames: shot.length,
      games,
    };
  });
}

/** Players on tonight's teams with the highest double-double rates this season. */
export function doubleDoubleWatch(
  lines: PlayerLine[],
  teams: Set<string>,
  minGames = 3,
  limit = 8,
) {
  return lines
    .filter((l) => teams.has(l.team) && l.gp >= minGames && l.dd > 0)
    .map((l) => ({ ...l, rate: l.dd / l.gp }))
    .sort(
      (a, b) =>
        b.rate - a.rate || b.dd - a.dd || b.reb + b.ast - (a.reb + a.ast),
    )
    .slice(0, limit);
}

export type Market = "player_points" | "player_rebounds";
export type PropQuote = {
  player: string;
  market: Market;
  line: number;
  over: number | null;
  under: number | null;
};
type PropPayload = {
  book?: string;
  market?: string;
  outcomes?: {
    name?: string;
    description?: string;
    point?: number;
    price?: number;
  }[];
};

/** Half-point Over/Under lines from FanDuel snapshots; the newest snapshot per market wins. */
export function propQuotes(
  snapshots: { recorded_at: string; payload: PropPayload }[],
  book = "FanDuel",
): PropQuote[] {
  const newest = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const m = s.payload?.market;
    if (
      s.payload?.book !== book ||
      (m !== "player_points" && m !== "player_rebounds")
    )
      continue;
    const prev = newest.get(m);
    if (!prev || Date.parse(s.recorded_at) > Date.parse(prev.recorded_at))
      newest.set(m, s);
  }
  const quotes = new Map<string, PropQuote>();
  for (const s of newest.values()) {
    for (const o of s.payload.outcomes || []) {
      const player = (o.description || "").trim();
      if (
        !player ||
        typeof o.point !== "number" ||
        (o.point * 2) % 2 !== 1 ||
        typeof o.price !== "number"
      )
        continue;
      if (o.name !== "Over" && o.name !== "Under") continue;
      const market = s.payload.market as Market;
      const key = `${market}|${player}|${o.point}`;
      const q = quotes.get(key) || {
        player,
        market,
        line: o.point,
        over: null,
        under: null,
      };
      if (o.name === "Over") q.over = o.price;
      else q.under = o.price;
      quotes.set(key, q);
    }
  }
  return [...quotes.values()];
}

export type PropTrend = PropQuote & {
  team: string;
  gp: number;
  seasonAvg: number;
  lastN: number;
  lastHits: number;
  seasonHits: number;
  gap: number;
};

/** How often the player cleared the line: last 5 and season, from recorded box scores only. */
export function propTrends(
  quotes: PropQuote[],
  lines: PlayerLine[],
  last = 5,
): PropTrend[] {
  const byName = new Map(lines.map((l) => [nameKey(l.player), l]));
  const out: PropTrend[] = [];
  for (const q of quotes) {
    const l = byName.get(nameKey(q.player));
    if (!l || !l.gp) continue;
    const stat = (g: GameStat) =>
      q.market === "player_points" ? g.pts : g.reb;
    const recent = l.games.slice(0, last);
    const seasonAvg = q.market === "player_points" ? l.pts : l.reb;
    out.push({
      ...q,
      team: l.team,
      gp: l.gp,
      seasonAvg,
      lastN: recent.length,
      lastHits: recent.filter((g) => stat(g) > q.line).length,
      seasonHits: l.games.filter((g) => stat(g) > q.line).length,
      gap: seasonAvg - q.line,
    });
  }
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

export type Injury = {
  player: string;
  team: string;
  status: string;
  injury: string;
};
const SEVERITY: Record<string, number> = {
  Out: 0,
  Doubtful: 1,
  Questionable: 2,
  "Day-To-Day": 3,
  Probable: 4,
};

/** The latest report per player, most serious first; anything not on the list is left out. */
export function latestInjuries(
  reports: {
    observed_at: string | null;
    recorded_at: string;
    payload: Record<string, unknown>;
  }[],
) {
  const latest = new Map<string, { at: number; injury: Injury }>();
  for (const r of reports) {
    const p = r.payload || {};
    const player = typeof p.player === "string" ? p.player : "";
    const team = typeof p.team === "string" ? p.team : "";
    const status = typeof p.status === "string" ? p.status : "";
    if (!player || !team || !(status in SEVERITY)) continue;
    const at = Date.parse(r.observed_at || r.recorded_at);
    const key = `${team}|${nameKey(player)}`;
    const prev = latest.get(key);
    if (!prev || at > prev.at)
      latest.set(key, {
        at,
        injury: {
          player,
          team,
          status,
          injury: typeof p.injury === "string" ? p.injury : "",
        },
      });
  }
  return [...latest.values()]
    .map((v) => v.injury)
    .sort(
      (a, b) =>
        SEVERITY[a.status] - SEVERITY[b.status] ||
        a.player.localeCompare(b.player),
    );
}

/** Players on tonight's teams with the most 3s attempted (or made) per game; 3+ games with recorded attempts. */
export function threePointLeaders(
  lines: PlayerLine[],
  teams: Set<string>,
  by: "tpa" | "tpm",
  minGames = 3,
  limit = 8,
) {
  const other = by === "tpa" ? "tpm" : "tpa";
  return lines
    .filter((l) => teams.has(l.team) && l.tpaGames >= minGames)
    .sort(
      (a, b) =>
        b[by] - a[by] ||
        b[other] - a[other] ||
        a.player.localeCompare(b.player),
    )
    .slice(0, limit);
}
