export type Card = { rank: string; suit: string };
export type Outcome = "win" | "loss" | "push";
// Rejection sampling avoids modulo bias; no model chooses the outcome.
export function randomInt(max: number): number {
  const limit = Math.floor(4294967296 / max) * max;
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}
export function deck(): Card[] {
  const cards = ["♠", "♥", "♦", "♣"].flatMap((suit) =>
    ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].map(
      (rank) => ({ rank, suit }),
    ),
  );
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export function total(cards: Card[]): number {
  let sum = 0,
    aces = 0;
  for (const c of cards) {
    sum +=
      c.rank === "A"
        ? 11
        : ["J", "Q", "K"].includes(c.rank)
          ? 10
          : Number(c.rank);
    if (c.rank === "A") aces++;
  }
  while (sum > 21 && aces-- > 0) sum -= 10;
  return sum;
}
export function outcome(player: Card[], house: Card[]): Outcome {
  const p = total(player),
    h = total(house);
  if (p > 21) return "loss";
  if (h > 21) return "win";
  const pn = p === 21 && player.length === 2,
    hn = h === 21 && house.length === 2;
  if (pn !== hn) return pn ? "win" : "loss";
  return p === h ? "push" : p > h ? "win" : "loss";
}
export function dayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
