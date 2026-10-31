import { moneylineRead, type MoneylineRead } from "./home-props";
import { nbaNickname } from "./nba-home";
import type { SlateGame } from "./sport-slate";

/** nba_games columns Home reads. */
export type NbaSlateRow = {
  id: string;
  slug?: string | null;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
  tipoff: string;
  tipoff_tbd: boolean | null;
  venue: string | null;
  status: string | null;
};

export function nbaSlateGame(g: NbaSlateRow): SlateGame {
  return {
    id: g.id,
    sport: "nba",
    away: {
      name: g.away_team,
      short: nbaNickname(g.away_team),
      abbreviation: g.away_abbreviation,
    },
    home: {
      name: g.home_team,
      short: nbaNickname(g.home_team),
      abbreviation: g.home_abbreviation,
    },
    start: g.tipoff,
    tbd: g.tipoff_tbd === true,
    venue: g.venue,
    status: g.status,
    href: g.slug ? `/nba/games/${encodeURIComponent(g.slug)}` : null,
  };
}

type Outcome = {
  name: string;
  price: number;
  point?: number;
  description?: string;
};
export type NbaQuoteRow = {
  game_id: string;
  kind: string;
  /** When the source observed the price (not when we stored it). */
  observed_at: string | null;
  recorded_at: string;
  payload: {
    book?: string;
    market?: string;
    outcomes?: Outcome[];
    provider_updated_at?: string;
  } | null;
};

/** The newest FanDuel quote per game and market (rows arrive newest first). */
/**
 * How old an NBA quote may be and still show. The collector refreshes FanDuel about every six hours
 * plus pregame passes, so eight hours keeps one refresh of slack; anything older, undated or
 * stamped in the future is dropped rather than shown as a current price.
 */
export const NBA_QUOTE_MAX_AGE_MS = 8 * 3600000;
const CLOCK_SKEW_MS = 5 * 60000;

/** When the source observed this quote: observed_at, else the provider's update time. Never recorded_at. */
export function quoteTime(r: NbaQuoteRow) {
  const t = Date.parse(r.observed_at || r.payload?.provider_updated_at || "");
  return Number.isFinite(t) ? t : null;
}

/** The newest current FanDuel quote per game and market. */
export function latestQuotes(rows: NbaQuoteRow[], now = Date.now()) {
  const out: Record<string, Record<string, NbaQuoteRow>> = {};
  for (const r of rows) {
    const market = r.payload?.market;
    const t = quoteTime(r);
    if (r.payload?.book !== "FanDuel" || !market || t === null) continue;
    if (t > now + CLOCK_SKEW_MS || now - t > NBA_QUOTE_MAX_AGE_MS) continue;
    const game = (out[r.game_id] ||= {});
    const held = game[market];
    if (!held || t > (quoteTime(held) ?? 0)) game[market] = r;
  }
  return out;
}

/** Card-face moneyline per game from the newest FanDuel h2h quote. */
export function nbaFaces(
  rows: NbaQuoteRow[],
  games: SlateGame[],
  now = Date.now(),
) {
  const faces: Record<string, MoneylineRead> = {};
  const latest = latestQuotes(rows, now);
  for (const g of games) {
    const h2h = latest[g.id]?.h2h?.payload?.outcomes;
    const read = h2h ? moneylineRead(h2h, g.home.name, g.away.name) : null;
    if (read) faces[g.id] = read;
  }
  return faces;
}

export type GameLine = { label: string; price: number; point?: number };

/** FanDuel spread and total sides for one game, exactly as quoted. */
export function gameLines(
  markets: Record<string, NbaQuoteRow> | undefined,
  g: SlateGame,
) {
  const sides = (market: string) => markets?.[market]?.payload?.outcomes || [];
  const team = (name: string) =>
    name === g.home.name
      ? g.home.short
      : name === g.away.name
        ? g.away.short
        : name;
  return {
    spread: sides("spreads")
      .filter((o) => Number.isFinite(o.point) && Number.isFinite(o.price))
      .map(
        (o): GameLine => ({
          label: team(o.name),
          point: o.point,
          price: o.price,
        }),
      ),
    total: sides("totals")
      .filter((o) => Number.isFinite(o.point) && Number.isFinite(o.price))
      .map(
        (o): GameLine => ({ label: o.name, point: o.point, price: o.price }),
      ),
    quotedAt:
      markets?.spreads?.payload?.provider_updated_at ||
      markets?.totals?.payload?.provider_updated_at ||
      null,
  };
}

export type PlayerLine = {
  player: string;
  stat: "PTS" | "REB";
  point: number;
  over: number | null;
  under: number | null;
};

/** One row per player and stat from FanDuel's player props, Over and Under at the same line. */
export function playerLines(
  markets: Record<string, NbaQuoteRow> | undefined,
): PlayerLine[] {
  const out: PlayerLine[] = [];
  for (const [market, stat] of [
    ["player_points", "PTS"],
    ["player_rebounds", "REB"],
  ] as const) {
    const rows = new Map<string, PlayerLine>();
    for (const o of markets?.[market]?.payload?.outcomes || []) {
      if (
        !o.description ||
        !Number.isFinite(o.point) ||
        !Number.isFinite(o.price)
      )
        continue;
      const key = `${o.description}|${o.point}`;
      const row = rows.get(key) || {
        player: o.description,
        stat,
        point: o.point!,
        over: null,
        under: null,
      };
      if (o.name === "Over") row.over = o.price;
      else if (o.name === "Under") row.under = o.price;
      else continue;
      rows.set(key, row);
    }
    out.push(...rows.values());
  }
  return out.sort(
    (a, b) =>
      a.stat.localeCompare(b.stat) ||
      b.point - a.point ||
      a.player.localeCompare(b.player),
  );
}

/** "Over 17.5 PTS" from an editorial selection. */
export function selectionLabel(p: {
  market: string;
  direction: string;
  line: number;
}) {
  const stat =
    p.market === "player_points"
      ? "PTS"
      : p.market === "player_rebounds"
        ? "REB"
        : p.market.replace(/_/g, " ").toUpperCase();
  return `${p.direction} ${p.line} ${stat}`;
}

/**
 * Selections still current: a revised publication names the one it replaces in supersedes_id, so
 * the replaced row never shows (or copies) beside its successor.
 */
export function currentSelections<
  T extends { id: string; supersedes_id?: string | null },
>(rows: T[]) {
  const replaced = new Set(rows.map((r) => r.supersedes_id).filter(Boolean));
  return rows.filter((r) => !replaced.has(r.id));
}
