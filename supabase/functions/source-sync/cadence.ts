// When to spend The Odds API credits. The source refresh runs every 15 minutes, but quoting
// every run would cost ~10k credits a month; prices only need to be fresh near kickoff.
const MIN = 60000,
  HOUR = 60 * MIN;
// Slightly under the nominal gap so a run that fires a few seconds early still counts.
const due = (last: number | null, now: number, gap: number) =>
  last === null || now - last >= gap - MIN;

/** Game lines (3 credits a call): every 2 hours, every 15 minutes within 2 hours of a kickoff. */
export function gameLinesDue(kickoffs: number[], last: number | null, now: number) {
  const ahead = kickoffs.filter((k) => k > now && k <= now + 7 * 24 * HOUR);
  if (!ahead.length) return false;
  return due(last, now, ahead.some((k) => k - now <= 2 * HOUR) ? 15 * MIN : 2 * HOUR);
}

/** Player props: games within a day, every 3 hours, every 15 minutes within 2 hours of kickoff.
 * Each requested market consumes provider credits; published-pick games request extra markets.
 */
export function propsDue(kickoffs: number[], last: number | null, now: number) {
  const ahead = kickoffs.filter((k) => k > now && k <= now + 24 * HOUR);
  if (!ahead.length) return false;
  return due(last, now, ahead.some((k) => k - now <= 2 * HOUR) ? 15 * MIN : 3 * HOUR);
}

/** Props horizon passed to upcomingPropEvents: only games inside the next day are quoted. */
export const PROPS_HORIZON = 24 * HOUR;
