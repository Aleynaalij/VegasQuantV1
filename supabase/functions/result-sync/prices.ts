import { normal, type Contract } from "./grade.ts";

// FanDuel prices for a graded-pick contract, from The Odds API prop observations. Exact lines only:
// "60+ rushing yards" is the Over 59.5 line; "Over 86.5" / "Under 38.5" match that exact point.
export type Observation = {
  game_id: string;
  observed_at: string | null;
  payload: {
    market?: string;
    book?: string;
    outcomes?: {
      name: string;
      description?: string;
      point?: number;
      price: number;
    }[];
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
  def_sacks: "player_sacks",
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

/** Latest exact-line FanDuel price at or before `at` (kickoff for a closing price). */
export function marketPrice(
  c: Pick<Contract, "game_id" | "player" | "metric" | "operator" | "threshold">,
  observations: Observation[],
  at: number,
): MarketPrice | null {
  const keys = marketKeys(c.metric),
    want = wantedLine(c),
    who = playerName(c.player);
  let best: MarketPrice | null = null;
  for (const o of observations) {
    const t = Date.parse(o.observed_at || "");
    if (o.game_id !== c.game_id || !Number.isFinite(t) || t > at) continue;
    if (o.payload.book !== "FanDuel" || !keys.includes(o.payload.market || ""))
      continue;
    const hits = (o.payload.outcomes || []).filter(
      (x) =>
        x.name === want.name &&
        x.point === want.point &&
        playerName(x.description || "") === who &&
        Number.isFinite(x.price) &&
        Math.abs(x.price) >= 100,
    );
    // Two different prices for the same line in one snapshot is ambiguous; skip it.
    if (new Set(hits.map((x) => x.price)).size !== 1) continue;
    if (!best || t > Date.parse(best.observed_at))
      best = {
        book: "FanDuel",
        price: hits[0].price,
        point: want.point,
        observed_at: o.observed_at!,
      };
  }
  return best;
}
