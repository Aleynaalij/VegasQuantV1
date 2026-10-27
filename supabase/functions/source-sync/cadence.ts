// When to spend The Odds API credits. The source refresh runs every 15 minutes, but quoting
// every run would cost ~10k credits a month; prices only need to be fresh near kickoff.
const MIN = 60000,
  HOUR = 60 * MIN;
// Slightly under the nominal gap so a run that fires a few seconds early still counts.
const due = (last: number | null, now: number, gap: number) =>
  last === null || now - last >= gap - MIN;

/** Game lines (3 credits a call): every 2 hours, every 15 minutes within 2 hours of a kickoff. */
export function gameLinesDue(
  kickoffs: number[],
  last: number | null,
  now: number,
) {
  const ahead = kickoffs.filter((k) => k > now && k <= now + 7 * 24 * HOUR);
  if (!ahead.length) return false;
  return due(
    last,
    now,
    ahead.some((k) => k - now <= 2 * HOUR) ? 15 * MIN : 2 * HOUR,
  );
}

/** Research up to seven days ahead; slow distant games instead of repeatedly quoting the whole slate. */
export const PROPS_HORIZON = 7 * 24 * HOUR;
const propGap = (ahead: number) =>
  ahead <= 2 * HOUR ? 15 * MIN : ahead <= 24 * HOUR ? 3 * HOUR : 6 * HOUR;
export function propEventDue(
  kickoff: number,
  last: number | null,
  now: number,
) {
  const ahead = kickoff - now;
  return (
    Number.isFinite(kickoff) &&
    ahead > 0 &&
    ahead <= PROPS_HORIZON &&
    due(last, now, propGap(ahead))
  );
}
export function propsDue(kickoffs: number[], last: number | null, now: number) {
  return kickoffs.some((k) => propEventDue(k, last, now));
}
