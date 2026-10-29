/** Daily NBA 3-point volume card: data shape from public.nba_threes_card and small display helpers. */

export type ThreesLine = {
  player: string;
  team: string;
  games: number;
  tpa: number;
  tpm: number;
};
export type ThreesCard = {
  day: string;
  games: { away: string; home: string; tipoff: string }[];
  attempted: ThreesLine[];
  made: ThreesLine[];
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The ET date a post's card refers to ("nba-threes:2026-10-29"), or null for any other value. */
export function threesCardDay(card: string | null | undefined) {
  const m = /^nba-threes:(\d{4}-\d{2}-\d{2})$/.exec(card || "");
  return m ? m[1] : null;
}

/** A real calendar date in YYYY-MM-DD form. */
export function isCardDay(day: string) {
  if (!DAY.test(day)) return false;
  const d = new Date(`${day}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** "THU · OCT 29" */
export function cardDate(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const wd = d.toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
  });
  const md = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${wd} · ${md}`.toUpperCase();
}

export const pct = (l: { tpm: number; tpa: number }) =>
  l.tpa > 0 ? `${Math.round((100 * l.tpm) / l.tpa)}%` : "0%";
export const one = (n: number) => Number(n).toFixed(1);
