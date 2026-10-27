/** Read-only entertainment shuffler. It never computes prices or publishes picks. */
export type SlotLeg = {
  leg_key: string;
  name: string;
  market: string;
  matchup: string;
  game_id: string | null;
  expires_at: string;
  kind: string;
  result: string | null;
  published_at: string;
  copy_text: string | null;
};
const clean = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const ticketKey = (rows: SlotLeg[]) =>
  rows
    .map((r) => r.leg_key)
    .sort()
    .join("|");
export function slotPool(rows: SlotLeg[], now = Date.now()): SlotLeg[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .filter((r) => {
      if (
        !r.game_id ||
        !r.name?.trim() ||
        !r.market?.trim() ||
        r.result ||
        !Number.isFinite(Date.parse(r.expires_at)) ||
        Date.parse(r.expires_at) <= now ||
        !["RESEARCH", "OFFICIAL"].includes(r.kind)
      )
        return false;
      const key = `${r.game_id}|${clean(r.name)}|${clean(r.market)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
// One selection per player in a game, and one team-side market per game, avoids
// opposing sides and alternative thresholds for the same player on one ticket.
const group = (r: SlotLeg) =>
  `${r.game_id}|${/moneyline|spread|\bside\b/i.test(r.market) ? "team-side" : clean(r.name)}`;
export function spinTicket(
  rows: SlotLeg[],
  previous: string | ReadonlySet<string> | null,
  random: () => number = Math.random,
  now = Date.now(),
): SlotLeg[] {
  const pool = slotPool(rows, now);
  if (new Set(pool.map(group)).size < 8)
    throw new Error(
      "Eight different eligible selections are needed. Try again when more games are available.",
    );
  for (let attempt = 0; attempt < 80; attempt++) {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error("Invalid random source.");
      const j = Math.floor(value * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const used = new Set<string>();
    const selected = shuffled
      .filter((r) => {
        const k = group(r);
        if (used.has(k)) return false;
        used.add(k);
        return true;
      })
      .slice(0, 8);
    const key = ticketKey(selected);
    if (typeof previous === "string" ? key !== previous : !previous?.has(key))
      return selected;
  }
  throw new Error(
    "No different ticket could be drawn from this pool. Try again after the board updates.",
  );
}
export function slotCopy(rows: SlotLeg[]) {
  return [
    "VEGAS QUANT · VQ SLOTS",
    "Random 8-leg entertainment ticket · not an analyst recommendation",
    ...rows.map((r, i) => `${i + 1}. ${r.name} — ${r.market} (${r.matchup})`),
    "Market availability and prices must be checked. No combined odds or payout verified.",
  ].join("\n");
}
