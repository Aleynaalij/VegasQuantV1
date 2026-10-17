// NBA home "next tip-off" helpers: which regular-season game leads the page, and the rest of the slate.
export type NbaHomeGame = {
  id: string;
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

/**
 * Started and not final. A game past tip-off still marked scheduled counts too (the feed refreshes every
 * 15 minutes); a stale status never keeps a game "live" past 4 hours.
 */
export function nbaIsLive(g: NbaHomeGame, now: number) {
  const tip = Date.parse(g.tipoff);
  return !DONE.has(g.status || "") && tip <= now && now - tip < 4 * HOUR;
}

/**
 * Regular-season games for the home hero: live games first, then upcoming within a week.
 * `opening` is true while no regular-season game has tipped off yet.
 */
export function nbaHomeSlate(games: NbaHomeGame[], now: number) {
  const regular = games.filter(
    (g) => g.season_type === 2 && Number.isFinite(Date.parse(g.tipoff)),
  );
  const live = regular.filter((g) => nbaIsLive(g, now));
  const upcoming = regular
    .filter(
      (g) =>
        Date.parse(g.tipoff) > now &&
        Date.parse(g.tipoff) <= now + 7 * 24 * HOUR &&
        !DONE.has(g.status || ""),
    )
    .sort((a, b) => Date.parse(a.tipoff) - Date.parse(b.tipoff));
  const ordered = [
    ...live.sort((a, b) => Date.parse(a.tipoff) - Date.parse(b.tipoff)),
    ...upcoming,
  ];
  const opening = !regular.some((g) => Date.parse(g.tipoff) <= now);
  return {
    next: ordered[0] ?? null,
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
