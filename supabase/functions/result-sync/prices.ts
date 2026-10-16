import { normal, type Contract } from "./grade.ts";

// Sportsbook prices for a graded-pick contract, from The Odds API prop observations. Exact lines only:
// "60+ rushing yards" is the Over 59.5 line; "Over 86.5" / "Under 38.5" match that exact point.
export type Observation = {
  game_id: string;
  observed_at: string | null;
  payload: {
    market?: string;
    book?: string;
    outcomes?: { name: string; description?: string; point?: number; price: number }[];
  };
};
export type MarketPrice = {
  book: string;
  price: number;
  point: number;
  observed_at: string;
};

const MARKETS: Record<Contract["metric"], string> = {
  rushing_yards: "player_rush_yds",
  receiving_yards: "player_reception_yds",
  passing_yards: "player_pass_yds",
  receptions: "player_receptions",
};
/** Standard and alternate-line market keys for a metric. */
export const marketKeys = (metric: Contract["metric"]) => [
  MARKETS[metric],
  `${MARKETS[metric]}_alternate`,
];

const playerName = (s: string) =>
  normal(s.replace(/\s+(?:Jr\.?|Sr\.?|II|III|IV)$/i, ""));

/** The outcome a contract corresponds to: side and exact point. */
export function wantedLine(c: Pick<Contract, "operator" | "threshold">) {
  return c.operator === "gte"
    ? { name: "Over", point: c.threshold - 0.5 }
    : { name: c.operator === "over" ? "Over" : "Under", point: c.threshold };
}

/** Exact-line prices for the contract in one snapshot, or null when the snapshot is ambiguous. */
function snapshotPrice(
  c: Pick<Contract, "player" | "metric" | "operator" | "threshold">,
  o: Observation,
) {
  const want = wantedLine(c),
    who = playerName(c.player);
  if (!marketKeys(c.metric).includes(o.payload.market || "")) return null;
  const hits = (o.payload.outcomes || []).filter(
    (x) =>
      x.name === want.name &&
      x.point === want.point &&
      playerName(x.description || "") === who &&
      Number.isFinite(x.price) &&
      Math.abs(x.price) >= 100,
  );
  // Two different prices for the same line in one snapshot is ambiguous; skip it.
  return new Set(hits.map((x) => x.price)).size === 1 ? { price: hits[0].price, point: want.point } : null;
}

/** Latest exact-line price at one book at or before `at` (kickoff for a closing price). */
export function marketPrice(
  c: Pick<Contract, "game_id" | "player" | "metric" | "operator" | "threshold">,
  observations: Observation[],
  at: number,
  book = "FanDuel",
): MarketPrice | null {
  return bookPrices(c, observations, at).find((p) => p.book === book) || null;
}

/**
 * Latest exact-line price at every book that quotes the line, at or before `at`. Only each book's
 * latest snapshot per market counts, so a line a book has since withdrawn is never revived from an
 * older snapshot. `quoting` lists every book with a current snapshot for the market, priced or not.
 */
export function bookQuotes(
  c: Pick<Contract, "game_id" | "player" | "metric" | "operator" | "threshold">,
  observations: Observation[],
  at: number,
): { prices: MarketPrice[]; quoting: string[] } {
  const keys = marketKeys(c.metric);
  const latest = new Map<string, Observation>();
  for (const o of observations) {
    const t = Date.parse(o.observed_at || "");
    const book = o.payload.book;
    if (o.game_id !== c.game_id || !book || !Number.isFinite(t) || t > at) continue;
    if (!keys.includes(o.payload.market || "")) continue;
    const k = `${book}\u0000${o.payload.market}`;
    const prior = latest.get(k);
    if (!prior || t > Date.parse(prior.observed_at!)) latest.set(k, o);
  }
  const best = new Map<string, MarketPrice>();
  for (const o of latest.values()) {
    const hit = snapshotPrice(c, o);
    const book = o.payload.book!;
    if (!hit) continue;
    const prior = best.get(book);
    if (!prior || Date.parse(o.observed_at!) > Date.parse(prior.observed_at))
      best.set(book, { book, price: hit.price, point: hit.point, observed_at: o.observed_at! });
  }
  return {
    prices: [...best.values()].sort((a, b) => a.book.localeCompare(b.book)),
    quoting: [...new Set([...latest.values()].map((o) => o.payload.book!))].sort(),
  };
}

/** Latest exact-line price at every book that currently quotes the line. */
export const bookPrices = (
  c: Pick<Contract, "game_id" | "player" | "metric" | "operator" | "threshold">,
  observations: Observation[],
  at: number,
) => bookQuotes(c, observations, at).prices;
