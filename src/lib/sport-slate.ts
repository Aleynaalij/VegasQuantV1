import type { Sport } from "./sports";

/** One team as every sport's slate shows it. */
export type SlateTeam = {
  name: string;
  /** "Seahawks", "Celtics", "Duke" — what the card and rows print. */
  short: string;
  abbreviation: string | null;
  /** ESPN numeric team ID where the source carries one (college logos). */
  espnId?: string | null;
};

/** A scheduled game in any sport, shaped the same for Home's card and rows. */
export type SlateGame = {
  id: string;
  sport: Sport;
  away: SlateTeam;
  home: SlateTeam;
  start: string;
  venue: string | null;
  /** College games at a neutral site have no home court. */
  neutral?: boolean;
  status?: string | null;
  /** The game's own page, when the sport has one. */
  href?: string | null;
};

const CLOSED = /FINAL|CANCEL|POSTPON|SUSPEND/i;

/** Games that haven't started, inside the next week, soonest first. */
export function upcomingSlate(games: SlateGame[], now = Date.now()) {
  return games
    .filter(
      (g) =>
        Date.parse(g.start) > now &&
        Date.parse(g.start) <= now + 7 * 86400000 &&
        !CLOSED.test(g.status || ""),
    )
    .sort(
      (a, b) =>
        Date.parse(a.start) - Date.parse(b.start) || a.id.localeCompare(b.id),
    );
}

/** "Seahawks" from "Seattle Seahawks"; keeps two-word nicknames the sports use. */
export function nickname(team: string) {
  const two = team.match(
    / (Trail Blazers|Red Wings|Blue Jackets|Maple Leafs|Golden Knights)$/,
  );
  return two ? two[1] : team.split(" ").at(-1) || team;
}

export const easternTime = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    ...opts,
  });
