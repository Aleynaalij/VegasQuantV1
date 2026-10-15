// Profit at published prices for graded individual selections: 1 unit per pick at the American
// odds printed when the pick went out. Parlays, Hail Marys and official picks have their own records.
export type PricedLeg = {
  leg_key: string;
  kind: string;
  name: string;
  market: string;
  matchup: string;
  game_id: string | null;
  published_at: string;
  result: string | null;
  result_source: string | null;
  odds: number | string | null;
  original_leg_key?: string | null;
};

/** Units won on a 1-unit stake at American odds. */
export const profitUnits = (odds: number) =>
  odds > 0 ? odds / 100 : 100 / Math.abs(odds);

/** Win probability a price implies (no vig removed). */
export const impliedProbability = (odds: number) =>
  odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);

const priceOf = (leg: PricedLeg) => {
  const n = Number(leg.odds);
  return leg.odds !== null && leg.odds !== "" && Number.isFinite(n) && Math.abs(n) >= 100
    ? n
    : null;
};

const sameSelection = (leg: PricedLeg) =>
  [
    leg.game_id || leg.matchup.split(" · ")[0],
    leg.name,
    leg.market,
  ]
    .map((s) => s.trim().toLowerCase())
    .join("|");

/** Closing FanDuel price per leg key (last price before kickoff), when the feed matched one. */
export type Closing = Map<string, number>;

export function pricedRecord(legs: PricedLeg[], closing: Closing = new Map()) {
  // Only individual picks with a verified (https-sourced) result.
  const graded = legs.filter(
    (l) =>
      (l.kind === "SINGLE" || l.kind === "PICK_OF_DAY") &&
      ["WIN", "LOSS", "PUSH"].includes(l.result || "") &&
      /^https:\/\//.test(l.result_source || ""),
  );
  // A price revision or a repeat of the same selection counts once, at the earliest publication.
  const first = new Map<string, PricedLeg>();
  for (const l of [...graded].sort(
    (a, b) => Date.parse(a.published_at) - Date.parse(b.published_at),
  )) {
    const key = l.original_leg_key || sameSelection(l);
    if (!first.has(key) && !first.has(sameSelection(l))) {
      first.set(key, l);
      first.set(sameSelection(l), l);
    }
  }
  const unique = [...new Set(first.values())];
  const priced = unique.filter((l) => priceOf(l) !== null);
  let units = 0,
    wins = 0,
    losses = 0,
    pushes = 0,
    breakEven = 0;
  for (const l of priced) {
    const odds = priceOf(l)!;
    if (l.result === "WIN") {
      wins++;
      units += profitUnits(odds);
    } else if (l.result === "LOSS") {
      losses++;
      units -= 1;
    } else pushes++;
    if (l.result !== "PUSH") breakEven += impliedProbability(odds);
  }
  const decided = wins + losses;
  // Closing line value: did the published price beat FanDuel's last price before kickoff?
  let clvPicks = 0,
    beatClose = 0,
    clvPoints = 0;
  for (const l of priced) {
    const close = closing.get(l.leg_key);
    if (close === undefined) continue;
    const edge = impliedProbability(close) - impliedProbability(priceOf(l)!);
    clvPicks++;
    clvPoints += edge * 100;
    if (edge > 0) beatClose++;
  }
  return {
    picks: priced.length,
    unpriced: unique.length - priced.length,
    wins,
    losses,
    pushes,
    units,
    roi: priced.length ? (units / priced.length) * 100 : null,
    hitRate: decided ? (wins / decided) * 100 : null,
    // Average price-implied win rate: the hit rate these prices needed just to break even.
    breakEvenRate: decided ? (breakEven / decided) * 100 : null,
    clvPicks,
    beatClose,
    // Average percentage points of implied probability gained versus the closing price.
    avgClv: clvPicks ? clvPoints / clvPicks : null,
  };
}
