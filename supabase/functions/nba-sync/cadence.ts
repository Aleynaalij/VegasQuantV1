// When to spend The Odds API credits on NBA. The refresh runs every 15 minutes; quotes only need to
// be fresh near tip-off, and NBA lines are posted about a day ahead. Credits: game lines cost 3 per
// call (three markets, one region); props cost one per market per event.
const MIN = 60000,
  HOUR = 60 * MIN;
const due = (last: number | null, now: number, gap: number) => last === null || now - last >= gap - MIN;

export const LINES_HORIZON = 36 * HOUR;
/** Game lines: every 3 hours while a game is within 36 hours, every 30 minutes within 2 hours of a tip. */
export function linesDue(tipoffs: number[], last: number | null, now: number) {
  const ahead = tipoffs.filter((t) => t > now && t <= now + LINES_HORIZON);
  if (!ahead.length) return false;
  return due(last, now, ahead.some((t) => t - now <= 2 * HOUR) ? 30 * MIN : 3 * HOUR);
}

export const PROPS_HORIZON = 36 * HOUR;
const propGap = (ahead: number) => (ahead <= 2 * HOUR ? 30 * MIN : ahead <= 8 * HOUR ? 2 * HOUR : 6 * HOUR);
/** One event's props: every 6 hours until 8 hours out, every 2 hours, then every 30 minutes in the last 2. */
export function propEventDue(tipoff: number, last: number | null, now: number) {
  const ahead = tipoff - now;
  return Number.isFinite(tipoff) && ahead > 0 && ahead <= PROPS_HORIZON && due(last, now, propGap(ahead));
}

/** Per-event fetch times carried between runs, cleaned of anything malformed or in the future. */
export function eventFetchCache(details: Record<string, unknown> | undefined, marketKey: string, now: number) {
  if (details?.market_key !== marketKey) return {} as Record<string, string>;
  const raw = details.event_fetched_at;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {} as Record<string, string>;
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([k, v]) => /^[a-zA-Z0-9_-]+$/.test(k) && typeof v === "string" && Number.isFinite(Date.parse(v)) && Date.parse(v) <= now,
    ),
  ) as Record<string, string>;
}
