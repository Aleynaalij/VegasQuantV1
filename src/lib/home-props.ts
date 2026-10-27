/** Display helpers for Home's game list: prop line/stat labels and the market moneyline read. */

const STATS: [RegExp, string][] = [
  [/receiving\s+(?:yards|yds)/i, "REC YDS"],
  [/rushing\s+(?:yards|yds)/i, "RUSH YDS"],
  [/passing\s+(?:yards|yds)/i, "PASS YDS"],
  [/\b(?:receptions|catches)\b/i, "RECS"],
  [/touchdown|\bany td\b/i, "ANY TD"],
];

export type PropLine = { direction: "Over" | "Under"; line: number; stat: string };

/**
 * "Full game · 60+ receiving yards" → Over 59.5 REC YDS (a 60+ target clears on 60 or more).
 * "Over 59.5 receiving yards" and "Under 24.5 receptions" keep their stated line.
 * Returns null when the market isn't a single numeric player target.
 */
export function propLine(market: string, name = ""): PropLine | null {
  const text = `${name} ${market}`;
  const stat = STATS.find(([re]) => re.test(text))?.[1];
  if (!stat) return null;
  const stated = market.match(/\b(over|under)\s+(\d+(?:\.\d+)?)/i);
  if (stated)
    return {
      direction: stated[1].toLowerCase() === "under" ? "Under" : "Over",
      line: Number(stated[2]),
      stat,
    };
  const target = text.match(/(\d+(?:\.\d+)?)\+/);
  if (target) return { direction: "Over", line: Number(target[1]) - 0.5, stat };
  if (stat === "ANY TD") return { direction: "Over", line: 0.5, stat };
  return null;
}

/** Implied probability of an American price, 0–1. */
export function implied(price: number): number {
  return price < 0 ? -price / (-price + 100) : 100 / (price + 100);
}

export type MoneylineRead = {
  home: { price: number; probability: number };
  away: { price: number; probability: number };
};

/**
 * No-vig win probabilities from one book's two-way moneyline. Outcomes are matched to the
 * game's full team names; anything else (a draw, a missing side, a bad price) returns null.
 */
export function moneylineRead(
  outcomes: { name: string; price: number }[],
  homeTeam: string,
  awayTeam: string,
): MoneylineRead | null {
  const find = (team: string) =>
    outcomes.find((o) => o.name.trim().toLowerCase() === team.trim().toLowerCase());
  const home = find(homeTeam),
    away = find(awayTeam);
  if (outcomes.length !== 2 || !home || !away) return null;
  if (![home.price, away.price].every((p) => Number.isFinite(p) && Math.abs(p) >= 100))
    return null;
  const h = implied(home.price),
    a = implied(away.price);
  return {
    home: { price: home.price, probability: h / (h + a) },
    away: { price: away.price, probability: a / (h + a) },
  };
}

export const americanPrice = (price: number) => (price > 0 ? `+${price}` : `${price}`);
