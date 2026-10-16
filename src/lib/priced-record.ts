import { checkLeg, verdict, type LegForm } from "./leg-rules";

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

/** Closing price at the published book per leg key (last price before kickoff), when the feed matched one. */
export type Closing = Map<string, number>;

/** Graded individual picks with a verified result, each selection once at its first publication. */
export function uniquePicks(legs: PricedLeg[]) {
  // Only individual picks with a verified (https-sourced) result.
  return firstPublications(
    legs.filter(
      (l) =>
        (l.kind === "SINGLE" || l.kind === "PICK_OF_DAY") &&
        ["WIN", "LOSS", "PUSH"].includes(l.result || "") &&
        /^https:\/\//.test(l.result_source || ""),
    ),
  );
}

/** Each selection once, at its earliest publication: a price revision or a repeat counts once. */
function firstPublications(legs: PricedLeg[]) {
  const first = new Map<string, PricedLeg>();
  for (const l of [...legs].sort(
    (a, b) => Date.parse(a.published_at) - Date.parse(b.published_at),
  )) {
    // Index each kept pick by its own leg key too, so a revision whose wording changed still
    // finds its original through original_leg_key.
    const keys = [l.leg_key, sameSelection(l), ...(l.original_leg_key ? [l.original_leg_key] : [])];
    if (keys.some((k) => first.has(k))) continue;
    for (const k of keys) first.set(k, l);
  }
  return [...new Set(first.values())];
}

export function pricedRecord(legs: PricedLeg[], closing: Closing = new Map()) {
  const unique = uniquePicks(legs);
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
  // Closing line value: did the published price beat its book's last price before kickoff?
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

/**
 * The same record split by the standing selection rules (research/lessons): picks that passed
 * every automatic check, picks that broke at least one, and picks without enough history to judge.
 */
export function gatedRecords(
  legs: PricedLeg[],
  closing: Closing,
  forms: Map<string, LegForm>,
) {
  const groups = { pass: [] as PricedLeg[], fail: [] as PricedLeg[], unknown: [] as PricedLeg[] };
  for (const l of uniquePicks(legs)) {
    const checks = checkLeg({
      price: priceOf(l),
      lastPrice: closing.get(l.leg_key),
      form: forms.get(l.leg_key) ?? (l.original_leg_key ? forms.get(l.original_leg_key) : undefined),
      market: l.market,
      matchup: l.matchup,
      pickOfDay: l.kind === "PICK_OF_DAY",
    });
    groups[verdict(checks)].push(l);
  }
  return {
    pass: pricedRecord(groups.pass, closing),
    fail: pricedRecord(groups.fail, closing),
    unknown: pricedRecord(groups.unknown, closing),
  };
}

/** First and last tracked price at a leg's published book; after kickoff the last one is the close. */
export type TrackedPrice = { first: number; last: number };

/**
 * Beat the close: for every published leg whose game has started and whose book price was tracked,
 * did the pick go out at a better price than the market closed at? The starting price is the
 * printed odds, or the first tracked price when the leg was published without one. Results are not
 * needed: a pick that beats the close got value whether it won or lost.
 */
export function closingLineRecord(legs: PricedLeg[], tracked: Map<string, TrackedPrice>) {
  let beat = 0,
    tied = 0,
    missed = 0,
    points = 0;
  const ok = (n: number) => Number.isFinite(n) && Math.abs(n) >= 100;
  for (const l of firstPublications(legs.filter((x) => tracked.has(x.leg_key)))) {
    const t = tracked.get(l.leg_key)!;
    const start = priceOf(l) ?? t.first;
    if (!ok(start) || !ok(t.last)) continue;
    // Percentage points of win probability the close implies beyond the price we gave.
    const edge = (impliedProbability(t.last) - impliedProbability(start)) * 100;
    points += edge;
    if (Math.abs(edge) < 1e-9) tied++;
    else if (edge > 0) beat++;
    else missed++;
  }
  const legsCounted = beat + tied + missed;
  return {
    legs: legsCounted,
    beat,
    tied,
    missed,
    // Share of legs that moved our way, out of those where the price moved at all.
    beatRate: beat + missed ? (beat / (beat + missed)) * 100 : null,
    avgPoints: legsCounted ? points / legsCounted : null,
  };
}
