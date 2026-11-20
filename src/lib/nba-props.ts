/**
 * Prop Finder rows: one row per FanDuel points/rebounds line on tonight's slate, with everything a
 * bettor scans for at a glance (hit rates, streak, our estimate, the edge over the book's no-vig
 * price, the best price across books). Pure functions; the slate comes from nba-tonight.
 */
import {
  hitRate,
  matchupFor,
  projectedMinutes,
  propEstimate,
  quoteIsFresh,
  propGames,
  restDays,
  type BookQuote,
  type DefenseRow,
  type Estimate,
  type Market,
  type Matchup,
  type PlayerLine,
  type PropGame,
  type PropTrend,
} from "./nba-research-tab";
import type { LineMove } from "./nba-line-moves";

export type PropSlateGame = {
  id: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
  tipoff: string;
};

export type Price = { book: string; price: number };
export type PropRow = {
  key: string;
  game: PropSlateGame;
  trend: PropTrend;
  player: PlayerLine;
  home: boolean;
  /** Tonight's opponent: abbreviation when known. */
  opponent: string;
  defense: string;
  /** Newest first. */
  games: PropGame[];
  l5: ReturnType<typeof hitRate>;
  l10: ReturnType<typeof hitRate>;
  season: ReturnType<typeof hitRate>;
  /** Overs (positive) or unders (negative) in a row, newest game first. */
  streak: number;
  minutes: number | null;
  estimate: Estimate | null;
  /** FanDuel's over chance with the vig removed. */
  fair: number | null;
  /** Our estimate minus the book's no-vig chance, in percentage points. */
  edge: number | null;
  matchup: Matchup | null;
  /** Best over and under price at this exact line across books. */
  bestOver: Price | null;
  bestUnder: Price | null;
  /** Every book quoting this exact line with a fresh price. */
  books: BookQuote[];
  /**
   * FanDuel's line is over an hour old by provider time (or its time is unknown): the row is shown,
   * labelled, but has no edge and drops out of "Best edge".
   */
  stale: boolean;
  /** FanDuel's line from its first stored snapshot to now, when it has more than one state. */
  move: LineMove | null;
};

const implied = (o: number) => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
export function noVig(over: number | null, under: number | null) {
  if (over == null || under == null) return null;
  return Math.round((implied(over) / (implied(over) + implied(under))) * 100);
}

/** Consecutive overs (positive) or unders (negative) from the newest game. */
export function streakOf(games: PropGame[]) {
  if (!games.length) return 0;
  const first = games[0].over;
  let n = 0;
  for (const g of games) {
    if (g.over !== first) break;
    n++;
  }
  return first ? n : -n;
}

/** The best price for one side at this line: higher American odds pay more. */
function best(books: BookQuote[], side: "over" | "under"): Price | null {
  let top: Price | null = null;
  for (const b of books) {
    const price = b[side];
    if (price == null) continue;
    if (!top || price > top.price) top = { book: b.book, price };
  }
  return top;
}

/** A movement worth showing: more than one recorded state. */
function movement(m: LineMove | undefined) {
  return m && m.steps.length > 1 ? m : null;
}

/** Rows as of `now`: freshness is judged against the clock each time, not only when loaded. */
export function buildPropRows(
  slate: {
    games: PropSlateGame[];
    lines: PlayerLine[];
    trends: Map<string, PropTrend[]>;
    quotes: Map<string, BookQuote[]>;
    defense: DefenseRow[];
    moves?: Map<string, Map<string, LineMove>>;
  },
  now: number,
): PropRow[] {
  const byId = new Map(slate.lines.map((l) => [l.athlete_id, l]));
  const rows: PropRow[] = [];
  for (const game of slate.games) {
    const quotes = slate.quotes.get(game.id) || [];
    for (const trend of slate.trends.get(game.id) || []) {
      const player = byId.get(trend.athlete_id);
      if (!player) continue;
      const home = player.team === game.home_team;
      const games = propGames(player, trend.market, trend.line);
      const minutes = projectedMinutes(
        player.games,
        restDays(player.games[0]?.at, game.tipoff),
      );
      const defense = home ? game.away_team : game.home_team;
      const matchup = matchupFor(
        slate.defense,
        defense,
        player.position,
        trend.market,
      );
      const estimate = propEstimate(
        player.games,
        trend.market,
        trend.line,
        minutes,
        matchup?.factor,
      );
      const stale = !quoteIsFresh(trend.observedAt, now);
      const fair = stale ? null : noVig(trend.over, trend.under);
      const books = quotes.filter(
        (q) =>
          q.market === trend.market &&
          q.line === trend.line &&
          q.player === trend.player &&
          quoteIsFresh(q.observedAt, now),
      );
      rows.push({
        key: `${game.id}|${trend.market}|${trend.athlete_id}|${trend.line}`,
        game,
        trend,
        player,
        home,
        opponent:
          (home ? game.away_abbreviation : game.home_abbreviation) || defense,
        defense,
        games,
        l5: hitRate(games, 5),
        l10: hitRate(games, 10),
        season: hitRate(games),
        streak: streakOf(games),
        minutes,
        estimate,
        fair,
        edge: estimate && fair != null ? estimate.chance - fair : null,
        matchup,
        bestOver: best(books, "over"),
        bestUnder: best(books, "under"),
        books,
        stale,
        move: movement(
          slate.moves?.get(game.id)?.get(`${trend.market}|${trend.player}`),
        ),
      });
    }
  }
  return rows;
}

export type PropSort = "edge" | "hot" | "streak" | "line";
export const SORTS: { key: PropSort; label: string }[] = [
  { key: "edge", label: "Best edge" },
  { key: "hot", label: "Hottest L10" },
  { key: "streak", label: "Streaks" },
  { key: "line", label: "Avg vs line" },
];

/** Strongest lean first, either side: the over or the under can be the better read. */
export function sortRows(rows: PropRow[], by: PropSort) {
  const pct = (r: ReturnType<typeof hitRate>) => (r ? r.pct : 50);
  const score: Record<PropSort, (r: PropRow) => number> = {
    edge: (r) => (r.edge == null ? -1 : Math.abs(r.edge)),
    hot: (r) => Math.abs(pct(r.l10) - 50),
    streak: (r) => Math.abs(r.streak),
    line: (r) => Math.abs(r.trend.gap),
  };
  return [...rows].sort(
    (a, b) =>
      score[by](b) - score[by](a) ||
      a.trend.player.localeCompare(b.trend.player),
  );
}

/**
 * Which side the numbers favor. Against the book when both prices are known: the side our estimate
 * rates above the book's no-vig chance, so the edge shown (and ranked) is never negative. Otherwise
 * our estimate, else the L10 hit rate.
 */
export function lean(r: PropRow): "over" | "under" | null {
  if (r.edge != null) return r.edge >= 0 ? "over" : "under";
  if (r.estimate) return r.estimate.chance >= 50 ? "over" : "under";
  if (r.l10) return r.l10.pct >= 50 ? "over" : "under";
  return null;
}

export function filterRows(
  rows: PropRow[],
  opts: { market: Market | "all"; game: string | "all"; query: string },
) {
  const q = opts.query.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (opts.market === "all" || r.trend.market === opts.market) &&
      (opts.game === "all" || r.game.id === opts.game) &&
      (!q ||
        r.trend.player.toLowerCase().includes(q) ||
        r.player.team.toLowerCase().includes(q) ||
        (
          (r.home ? r.game.home_abbreviation : r.game.away_abbreviation) || ""
        ).toLowerCase() === q),
  );
}
