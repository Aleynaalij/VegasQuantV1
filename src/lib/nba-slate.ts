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
  recorded_at: string;
  payload: {
    book?: string;
    market?: string;
    outcomes?: Outcome[];
    provider_updated_at?: string;
  } | null;
};

/** The newest FanDuel quote per game and market (rows arrive newest first). */
export function latestQuotes(rows: NbaQuoteRow[]) {
  const out: Record<string, Record<string, NbaQuoteRow>> = {};
  for (const r of rows) {
    const market = r.payload?.market;
    if (r.payload?.book !== "FanDuel" || !market) continue;
    const game = (out[r.game_id] ||= {});
    if (!game[market]) game[market] = r;
  }
  return out;
}

/** Card-face moneyline per game from the newest FanDuel h2h quote. */
export function nbaFaces(rows: NbaQuoteRow[], games: SlateGame[]) {
  const faces: Record<string, MoneylineRead> = {};
  const latest = latestQuotes(rows);
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
