/** Read-only entertainment shuffler. It never computes prices or publishes picks. */
import { legFamily, parlayCopyLine, type PublishedLeg } from "./parlay-builder";
export type SlotLeg = {
  selection_group?: string;
  source_url?: string;
  book?: string;
  observed_at?: string;
  observation_id?: string;
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
        !["RESEARCH", "OFFICIAL", "MARKET"].includes(r.kind)
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
// Official picks carry the target in `name` ("Player 80+ receiving yards", market "Player
// Prop"); research rows use the bare name. The builder's parser yields the same player for both.
const player = (r: SlotLeg) => {
  const leg = r as unknown as PublishedLeg;
  return parlayCopyLine(leg) ? legFamily(leg).split(":")[1] : clean(r.name);
};
const group = (r: SlotLeg) =>
  `${r.game_id}|${r.selection_group || (/moneyline|spread|\bside\b/i.test(r.market) ? "team-side" : player(r))}`;
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
    // Draw across games first, so a large prop menu cannot crowd out the slate.
    const games = new Map<string, SlotLeg[]>();
    for (const row of shuffled) {
      const id = row.game_id!;
      const options = games.get(id);
      if (options) options.push(row);
      else games.set(id, [row]);
    }
    const gameIds = [...games.keys()];
    for (let i = gameIds.length - 1; i > 0; i--) {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new Error("Invalid random source.");
      const j = Math.floor(value * (i + 1));
      [gameIds[i], gameIds[j]] = [gameIds[j], gameIds[i]];
    }
    const used = new Set<string>();
    const selected: SlotLeg[] = [];
    while (selected.length < 8) {
      let added = false;
      for (const id of gameIds) {
        const row = games.get(id)!.find((r) => !used.has(group(r)));
        if (row) {
          used.add(group(row));
          selected.push(row);
          added = true;
        }
        if (selected.length === 8) break;
      }
      if (!added) break;
    }
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
    ...rows.map(
      (r, i) =>
        `${i + 1}. ${r.name} — ${r.market} (${r.matchup})${r.book ? ` · ${r.book} snapshot ${r.observed_at} · ${r.source_url}` : ""}`,
    ),
    "Market availability and prices must be checked. No combined odds or payout verified.",
  ].join("\n");
}
