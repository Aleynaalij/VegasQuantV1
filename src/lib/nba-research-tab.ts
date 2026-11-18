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
  /** The other team in that game and whether this player's team was at home, when known. */
  opponent?: string | null;
  opponent_abbr?: string | null;
  home?: boolean | null;
  /** ESPN's G, F or C. */
  position?: string | null;
  game_id?: string;
  /** Box-score usage rate for that game, when shooting is recorded for the whole team. */
  usage?: number | null;
};
export type GameStat = {
  pts: number;
  reb: number;
  ast: number;
  min: number;
  at?: string;
  opp?: string | null;
  home?: boolean | null;
  usage?: number | null;
};
export type PlayerLine = {
  athlete_id: string;
  player: string;
  team: string;
  /** Latest recorded position (G, F or C), if any. */
  position: string | null;
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
      at: r.tipoff,
      opp: r.opponent_abbr ?? r.opponent ?? null,
      home: r.home ?? null,
      usage: r.usage ?? null,
    }));
    const shot = list.filter((r) => r.three_attempts != null);
    return {
      athlete_id: list[0].athlete_id,
      player: list[0].player,
      team: list[0].team,
      position: list.find((r) => r.position)?.position ?? null,
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

export type BookQuote = PropQuote & { book: string };
/**
 * Every book's latest quotes for line shopping, each from that book's newest snapshot per market.
 * Like best-price.ts, a snapshot counts only when the provider observed it within maxAgeMs (default
 * an hour): a book that stopped refreshing must not show an old price as the best one.
 */
export function allBookQuotes(
  snapshots: {
    recorded_at: string;
    observed_at?: string | null;
    payload: PropPayload & { provider_updated_at?: string };
  }[],
  now: number,
  maxAgeMs = 60 * 60000,
): BookQuote[] {
  const fresh = snapshots.filter((s) => {
    const t = Date.parse(s.observed_at || s.payload?.provider_updated_at || "");
    return Number.isFinite(t) && t <= now + 5 * 60000 && now - t <= maxAgeMs;
  });
  const books = new Set(fresh.map((s) => s.payload?.book).filter(Boolean));
  return [...books].flatMap((book) =>
    propQuotes(fresh, book as string).map((q) => ({
      ...q,
      book: book as string,
    })),
  );
}

export type PropTrend = PropQuote & {
  athlete_id: string;
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
      athlete_id: l.athlete_id,
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

/** Eastern calendar day of an instant, as a day number, so rest is counted the way a schedule is. */
function etDayNumber(iso: string) {
  const [m, d, y] = new Date(iso)
    .toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/");
  return Date.UTC(+y, +m - 1, +d) / 86400000;
}

/** Full days off between two games (back-to-back = 0); null when either date is unknown. */
export function restDays(
  previous: string | undefined,
  next: string | undefined,
) {
  if (!previous || !next) return null;
  return Math.max(0, etDayNumber(next) - etDayNumber(previous) - 1);
}

export type PropGame = {
  at: string | null;
  opp: string | null;
  home: boolean | null;
  value: number;
  min: number;
  usage: number | null;
  rest: number | null;
  over: boolean;
};

/** One row per game played, newest first: the stat for this market, minutes and rest before it. */
export function propGames(
  line: PlayerLine,
  market: Market,
  mark: number,
): PropGame[] {
  return line.games.map((g, i) => {
    const value = market === "player_points" ? g.pts : g.reb;
    return {
      at: g.at ?? null,
      opp: g.opp ?? null,
      home: g.home ?? null,
      value,
      min: g.min,
      usage: g.usage ?? null,
      rest: restDays(line.games[i + 1]?.at, g.at),
      over: value > mark,
    };
  });
}

export type Venue = "all" | "home" | "away";
/** "any", or full days of rest: 0, 1, 2, or 3 meaning three or more. */
export type Rest = "any" | 0 | 1 | 2 | 3;

export function filterPropGames(games: PropGame[], venue: Venue, rest: Rest) {
  return games.filter(
    (g) =>
      (venue === "all" || g.home === (venue === "home")) &&
      (rest === "any" ||
        (g.rest != null && (rest === 3 ? g.rest >= 3 : g.rest === rest))),
  );
}

/** Share of the latest n games (all when n is omitted) that went over; null with no games. */
export function hitRate(games: PropGame[], n?: number) {
  const list = n == null ? games : games.slice(0, n);
  if (!list.length) return null;
  const hits = list.filter((g) => g.over).length;
  return { hits, n: list.length, pct: Math.round((hits / list.length) * 100) };
}

/** One row of public.nba_defense_vs_position: what a defense allowed per game to one position. */
export type DefenseRow = {
  team: string;
  pos: string;
  games: number;
  points: number;
  rebounds: number;
  points_rank: number;
  rebounds_rank: number;
};
export type Matchup = {
  pos: string;
  rank: number;
  of: number;
  allowed: number;
  league: number;
  /** Multiplier on the projection: allowed vs league average, halved toward 1 and kept within 15%. */
  factor: number;
  label: "Tough" | "Neutral" | "Soft";
};

/** How tonight's defense treats the player's position for this stat; rank 1 allows the least. */
export function matchupFor(
  rows: DefenseRow[],
  defense: string,
  pos: string | null,
  market: Market,
): Matchup | null {
  if (!pos) return null;
  const group = rows.filter((r) => r.pos === pos && r.games > 0);
  const row = group.find((r) => r.team === defense);
  if (!row || group.length < 2) return null;
  const pick = (r: DefenseRow) =>
    Number(market === "player_points" ? r.points : r.rebounds);
  const league = avg(group.map(pick));
  const rank = market === "player_points" ? row.points_rank : row.rebounds_rank;
  const raw = league > 0 ? pick(row) / league : 1;
  const factor = Math.min(1.15, Math.max(0.85, 1 + (raw - 1) / 2));
  const third = group.length / 3;
  return {
    pos,
    rank,
    of: group.length,
    allowed: pick(row),
    league,
    factor,
    label: rank <= third ? "Tough" : rank > 2 * third ? "Soft" : "Neutral",
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Minutes tonight from minutes played: the last five games weighted 5-4-3-2-1 (70%) with the
 * season average (30%), trimmed 3% on a back-to-back. Null before three games played.
 */
export function projectedMinutes(games: GameStat[], rest: number | null) {
  const played = games.filter((g) => g.min > 0);
  if (played.length < 3) return null;
  const recent = played.slice(0, 5);
  const weights = recent.map((_, i) => 5 - i);
  const weighted =
    recent.reduce((a, g, i) => a + g.min * weights[i], 0) /
    weights.reduce((a, w) => a + w, 0);
  const m = 0.7 * weighted + 0.3 * avg(played.map((g) => g.min));
  return round1(rest === 0 ? m * 0.97 : m);
}

/** Standard normal cumulative distribution (Abramowitz-Stegun 7.1.26, error < 1.5e-7). */
function phi(z: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(z)) / Math.SQRT2);
  const erf =
    1 -
    t *
      (0.254829592 +
        t *
          (-0.284496736 +
            t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) *
      Math.exp((-z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export type Estimate = { projection: number; chance: number; sd: number };

/**
 * Our estimate of the chance the player clears the line. Per-minute production (season and last 10,
 * equally weighted once he has 10 games) times projected minutes times the matchup factor, with the
 * spread taken from how far his own games have strayed from his per-minute rate (at least the
 * square root of the projection). Needs five games with minutes. Kept between 3% and 97%.
 */
export function propEstimate(
  games: GameStat[],
  market: Market,
  line: number,
  minutes: number | null,
  factor = 1,
): Estimate | null {
  const played = games.filter((g) => g.min > 0);
  if (played.length < 5 || minutes == null) return null;
  const stat = (g: GameStat) => (market === "player_points" ? g.pts : g.reb);
  const rate = (list: GameStat[]) =>
    list.reduce((a, g) => a + stat(g), 0) / list.reduce((a, g) => a + g.min, 0);
  const season = rate(played);
  const per =
    played.length >= 10 ? (season + rate(played.slice(0, 10))) / 2 : season;
  const projection = per * minutes * factor;
  const spread = Math.sqrt(
    avg(played.map((g) => (stat(g) - season * g.min) ** 2)),
  );
  const sd = Math.max(spread, Math.sqrt(Math.max(projection, 1)));
  const p = 1 - phi((line - projection) / sd);
  return {
    projection: round1(projection),
    chance: Math.round(Math.min(0.97, Math.max(0.03, p)) * 100),
    sd: round1(sd),
  };
}

/** A box-score row joined to its game, as the game research panel reads it. */
export type JoinedBoxRow = {
  game_id: string;
  athlete_id: string | number;
  player: string;
  team: string;
  played: boolean;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  threes: number | null;
  position: string | null;
  tipoff: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
};

/** Box rows with opponent, venue and usage filled in from the game each row belongs to. */
export function boxRowsFromGames(
  rows: JoinedBoxRow[],
  usage: Map<string, number>,
): BoxRow[] {
  return rows.map((r) => {
    const home = r.team === r.home_team;
    return {
      athlete_id: String(r.athlete_id),
      player: r.player,
      team: r.team,
      played: r.played,
      minutes: r.minutes,
      points: r.points,
      rebounds: r.rebounds,
      assists: r.assists,
      threes: r.threes,
      position: r.position,
      game_id: r.game_id,
      tipoff: r.tipoff,
      home,
      opponent: home ? r.away_team : r.home_team,
      opponent_abbr: home ? r.away_abbreviation : r.home_abbreviation,
      usage: usage.get(`${r.game_id}:${String(r.athlete_id)}`) ?? null,
    };
  });
}
