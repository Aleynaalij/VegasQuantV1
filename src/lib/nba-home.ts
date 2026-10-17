// NBA home "next tip-off" helpers: which regular-season game leads the page, and the rest of the slate.
export type NbaHomeGame = {
  id: string;
  slug?: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
  tipoff: string;
  tipoff_tbd: boolean;
  venue: string | null;
  season_type: number | null;
  status: string | null;
  away_score: number | null;
  home_score: number | null;
};

const DONE = new Set([
  "STATUS_FINAL",
  "STATUS_POSTPONED",
  "STATUS_CANCELED",
  "STATUS_SUSPENDED",
]);
const HOUR = 3600000;
/** 2026-27 regular-season opening night, as formatted by nbaWhen (MM/DD/YYYY, Eastern). */
export const NBA_OPENING_NIGHT = "10/20/2026";

/** ESPN logo file name: the lowercase ESPN abbreviation ("NY" -> "ny", "UTAH" -> "utah"). */
export function nbaLogoCode(abbreviation: string | null) {
  const code = (abbreviation || "").trim().toLowerCase();
  return /^[a-z]{2,4}$/.test(code) ? code : null;
}

/** "Portland Trail Blazers" -> "Trail Blazers"; otherwise the last word ("Boston Celtics" -> "Celtics"). */
export function nbaNickname(team: string) {
  return /Trail Blazers$/.test(team)
    ? "Trail Blazers"
    : team.split(" ").at(-1) || team;
}

/** ESPN statuses that prove a game is being played; nothing else is shown as live. */
const IN_PLAY = new Set([
  "STATUS_IN_PROGRESS",
  "STATUS_HALFTIME",
  "STATUS_END_PERIOD",
]);

/** Live only on ESPN's own in-play status; a stale status never keeps a game "live" past 4 hours. */
export function nbaIsLive(g: NbaHomeGame, now: number) {
  return IN_PLAY.has(g.status || "") && now - Date.parse(g.tipoff) < 4 * HOUR;
}

/**
 * Past a confirmed tip-off with no in-play or final status yet (a delay, or the 15-minute feed has not
 * caught up). Shown as "Awaiting game update", never as live. A TBD time is a placeholder, so it never
 * counts as elapsed.
 */
export function nbaAwaiting(g: NbaHomeGame, now: number) {
  const tip = Date.parse(g.tipoff);
  return (
    !g.tipoff_tbd &&
    !DONE.has(g.status || "") &&
    !IN_PLAY.has(g.status || "") &&
    tip <= now &&
    now - tip < 4 * HOUR
  );
}

/**
 * Regular-season games for the home hero: live games first, then games awaiting an update, then
 * upcoming within a week.
 * `opening` is true when the lead game is on opening night (an Eastern date), however few past
 * games the caller loaded.
 */
export function nbaHomeSlate(
  games: NbaHomeGame[],
  now: number,
  openingNight = NBA_OPENING_NIGHT,
) {
  const regular = games.filter(
    (g) => g.season_type === 2 && Number.isFinite(Date.parse(g.tipoff)),
  );
  const byTip = (a: NbaHomeGame, b: NbaHomeGame) =>
    Date.parse(a.tipoff) - Date.parse(b.tipoff);
  const live = regular.filter((g) => nbaIsLive(g, now)).sort(byTip);
  const awaiting = regular.filter((g) => nbaAwaiting(g, now)).sort(byTip);
  const upcoming = regular
    .filter(
      (g) =>
        !live.includes(g) &&
        Date.parse(g.tipoff) > now &&
        Date.parse(g.tipoff) <= now + 7 * 24 * HOUR &&
        !DONE.has(g.status || ""),
    )
    .sort(byTip);
  const ordered = [...live, ...awaiting, ...upcoming];
  const next = ordered[0] ?? null;
  const opening = next
    ? nbaWhen(next.tipoff, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }) === openingNight
    : false;
  return {
    next,
    rest: ordered.slice(1, 4),
    live: live.length,
    week: upcoming.length,
    opening,
  };
}

export function nbaWhen(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    ...opts,
  });
}
