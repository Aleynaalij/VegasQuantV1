// How often to refresh a sport's FanDuel lines, inside its fixed daily credit budget.
// Spreads the refreshes left today evenly until the last priced tip-off of the ET day, so the
// evening slate still has current prices. Only games a book has priced count: listed games that
// never get odds (early tournament slots, placeholders) must not burn the budget.
export const DAILY_CAP: Record<string, number> = { nhl: 150, ncaab: 50 }; // mirrors sports_reserve_credits
export const MIN_INTERVAL = 25 * 60000;
export const MAX_INTERVAL = 3 * 3600000;

type Game = { id: string; start_time: string };

/** UTC milliseconds of the next midnight in America/New_York after `now`. */
export function etDayEnd(now: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(now)).map((p) => [p.type, p.value]),
  );
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = local - Math.floor(now / 1000) * 1000; // ET minus UTC (negative)
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day + 1) - offset;
}

/** Credits already reserved today (the reservation counter resets at ET midnight). */
export function reservedToday(settings: { credit_day?: string | null; daily_reserved?: number | null }, now: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now));
  return settings.credit_day === today ? Math.max(0, settings.daily_reserved || 0) : 0;
}

export function linesInterval(o: {
  now: number;
  games: Game[];
  priced: Set<string>;
  cap: number;
  reserved: number;
  cost?: number;
}) {
  const cost = o.cost ?? 2;
  const end = etDayEnd(o.now);
  const tips = o.games
    .filter((g) => o.priced.has(g.id))
    .map((g) => Date.parse(g.start_time))
    .filter((t) => Number.isFinite(t) && t > o.now && t <= end);
  if (!tips.length) return MAX_INTERVAL;
  // Keep one refresh in hand for a late line move before the last tip.
  const left = Math.floor((o.cap - o.reserved) / cost) - 1;
  if (left <= 0) return MAX_INTERVAL;
  const span = Math.max(...tips) - o.now;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, span / left));
}
