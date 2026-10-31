import type { SportGame } from "../../../src/lib/sport-contract.ts";
type Attempt = {
  game_id: string;
  attempted_at: string;
  next_attempt_at: string;
};
const stamp = (s?: string) =>
  Number.isFinite(Date.parse(s || "")) ? Date.parse(s!) : 0;

/** Rotate bounded source refreshes even when unchanged bodies insert no new immutable fact. */
export function contextBatch(
  games: SportGame[],
  covered: Set<string>,
  attempts: Attempt[],
  now: number,
) {
  const tried = new Map(attempts.map((a) => [a.game_id, a]));
  return games
    .filter(
      (g) =>
        !g.completed &&
        !/FINAL|CANCEL|POSTPON|SUSPEND/i.test(g.status) &&
        !covered.has(g.id) &&
        Date.parse(g.start_time) > now &&
        Date.parse(g.start_time) <= now + 36 * 3600000 &&
        stamp(tried.get(g.id)?.next_attempt_at) <= now,
    )
    .sort(
      (a, b) =>
        stamp(tried.get(a.id)?.attempted_at) -
          stamp(tried.get(b.id)?.attempted_at) ||
        Date.parse(a.start_time) - Date.parse(b.start_time) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 4);
}
