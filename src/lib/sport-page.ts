import type { MoneylineRead } from "./home-props";
import { implied } from "./home-props";
import type {
  NewSport,
  SportGame,
  SportMarket,
  SportPage,
} from "./sport-contract";
import { nickname, type SlateGame } from "./sport-slate";

/** A contract game (sports_slate / sports_game) in the shared slate shape. */
export function slateGame(g: SportGame): SlateGame {
  const team = (t: SportGame["away"]) => ({
    name: t.name,
    short: t.short_name?.trim() || nickname(t.name),
    abbreviation: t.abbreviation || null,
    espnId:
      g.sport === "ncaab" && /^\d+$/.test(t.provider_id) ? t.provider_id : null,
  });
  return {
    id: g.id,
    sport: g.sport,
    away: team(g.away),
    home: team(g.home),
    start: g.start_time,
    tbd: g.start_time_tbd === true,
    venue: g.venue,
    neutral: g.neutral_site === true,
    status: g.completed ? "STATUS_FINAL" : g.status,
    href: g.slug ? `/${g.sport}/games/${encodeURIComponent(g.slug)}` : null,
  };
}

/**
 * The newest quote per exact selection. Lines refresh every 25 minutes near a game and every three
 * hours further out, so an older quote still shows (marked by `isStale`) rather than vanishing.
 */
export function latestMarkets(markets: SportMarket[]) {
  const seen = new Set<string>();
  return [...markets]
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))
    .filter((m) => {
      const key = [
        m.game_id,
        m.market,
        m.selection,
        m.player,
        m.athlete_id,
        m.side,
        m.direction,
        m.line,
      ].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Card-face moneyline from the open FanDuel h2h pair; null unless both sides are quoted. */
export function sportFace(markets: SportMarket[]): MoneylineRead | null {
  const h2h = markets.filter((m) => m.market === "h2h");
  const home = h2h.find((m) => m.side === "home"),
    away = h2h.find((m) => m.side === "away");
  if (
    !home ||
    !away ||
    ![home.odds, away.odds].every(
      (p) => Number.isFinite(p) && Math.abs(p) >= 100,
    )
  )
    return null;
  const h = implied(home.odds),
    a = implied(away.odds);
  return {
    home: { price: home.odds, probability: h / (h + a) },
    away: { price: away.odds, probability: a / (h + a) },
  };
}

export const MARKET_LABEL: Record<SportMarket["market"], string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
  player_points: "Player points",
  player_goals: "Player goals",
  player_goal_scorer_anytime: "Anytime goal scorer",
};

/** Which markets each sport shows (owner scope, #166). */
export const SPORT_MARKETS: Record<NewSport, SportMarket["market"][]> = {
  nhl: [
    "h2h",
    "totals",
    "player_points",
    "player_goals",
    "player_goal_scorer_anytime",
  ],
  ncaab: ["h2h", "spreads"],
};

/** "Over 5.5", "+3.5", "Yes" — the exact quoted side, never a substitute contract. */
export function marketLine(m: SportMarket) {
  if (m.market === "spreads" && m.line !== null)
    return `${m.selection} ${m.line > 0 ? `+${m.line}` : m.line}`;
  if (m.direction === "Yes") return "To score";
  if (m.direction && m.line !== null) return `${m.direction} ${m.line}`;
  return m.selection;
}

export type MarketGroup = {
  market: SportMarket["market"];
  label: string;
  rows: SportMarket[];
  settlement: string[];
};

/** One game's open markets grouped in display order, each group with its settlement notes. */
export function gameMarkets(
  page: Pick<SportPage, "sport" | "markets">,
  gameId: string,
): MarketGroup[] {
  const rows = latestMarkets(page.markets).filter(
    (m) => m.game_id === gameId,
  );
  return SPORT_MARKETS[page.sport]
    .map((market) => {
      const list = rows
        .filter((m) => m.market === market)
        .sort(
          (a, b) =>
            (a.player || "").localeCompare(b.player || "") ||
            (a.line ?? 0) - (b.line ?? 0) ||
            (a.direction || "").localeCompare(b.direction || "") ||
            (a.side || "").localeCompare(b.side || ""),
        );
      return {
        market,
        label: MARKET_LABEL[market],
        rows: list,
        settlement: [...new Set(list.map((m) => m.settlement_note))],
      };
    })
    .filter((g) => g.rows.length);
}

export type InjuryLine = { team: string; player: string; status: string };

const str = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

/**
 * Provider-reported injuries from a game's team_context facts (ESPN summary shape), newest fact
 * first. Anything that doesn't parse is skipped; omissions never mean a player is available.
 */
export function sportInjuries(facts: SportPage["facts"], gameId: string) {
  const lines: InjuryLine[] = [];
  const notes = new Set<string>();
  for (const f of facts) {
    if (f.game_id !== gameId || f.kind !== "team_context") continue;
    const p = f.payload as Record<string, unknown>;
    if (!Array.isArray(p.injuries)) continue;
    for (const note of [p.availability, p.goalie_confirmation])
      if (str(note)) notes.add(str(note)!);
    for (const t of p.injuries as Record<string, unknown>[]) {
      const team =
        str((t?.team as Record<string, unknown> | undefined)?.displayName) ||
        "Team";
      for (const i of Array.isArray(t?.injuries)
        ? (t.injuries as Record<string, unknown>[])
        : []) {
        const player = str(
          (i?.athlete as Record<string, unknown> | undefined)?.displayName,
        );
        const status = str(i?.status);
        if (
          player &&
          status &&
          !lines.some((l) => l.team === team && l.player === player)
        )
          lines.push({ team, player, status });
      }
    }
    break;
  }
  return { lines, notes: [...notes] };
}

/** A quote past its 30-minute freshness window: shown with its time, never as a current price. */
export const isStale = (
  m: Pick<SportMarket, "expires_at">,
  now = Date.now(),
) => Date.parse(m.expires_at) <= now;
