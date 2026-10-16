import { oddsObservations } from "./normalize.ts";
type Game = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff: string;
};
type Event = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
};
export function upcomingPropEvents(
  events: Event[],
  games: Game[],
  now: number,
  limit = 24,
  horizon = 7 * 86400000,
) {
  const eligible = events
    .filter(
      (e) =>
        /^[a-zA-Z0-9_-]+$/.test(e.id) &&
        Date.parse(e.commence_time) > now &&
        Date.parse(e.commence_time) <= now + horizon &&
        games.some(
          (g) =>
            g.home_team === e.home_team &&
            g.away_team === e.away_team &&
            Math.abs(Date.parse(g.kickoff) - Date.parse(e.commence_time)) <
              3600000,
        ),
    )
    .sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
  const unique = [...new Map(eligible.map((e) => [e.id, e])).values()];
  return {
    events: unique.slice(0, limit),
    skipped: Math.max(0, unique.length - limit),
  };
}
// Research prices are collected before selection; unsupported statistical models stay blocked.
export const BASE_PROP_MARKETS = [
  "player_rush_yds",
  "player_reception_yds",
  "player_pass_yds",
  "player_rush_yds_alternate",
  "player_reception_yds_alternate",
  "player_pass_yds_alternate",
  "player_sacks",
  "player_sacks_alternate",
];
export const PICK_PROP_MARKETS = [
  ...BASE_PROP_MARKETS,
  "player_receptions",
  "player_receptions_alternate",
];
export const PROP_MARKET_SET_VERSION = "nfl-research-v3-passing-sacks";
/** New market sets must refresh once immediately; old per-event caches cannot hide missing markets. */
export function propFetchCache(
  details: Record<string, unknown> | undefined,
  now: number,
): Record<string, string> {
  if (details?.market_set_version !== PROP_MARKET_SET_VERSION) return {};
  const raw = details.event_fetched_at;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter(
      ([key, value]) =>
        /^[a-zA-Z0-9_-]+$/.test(key) &&
        typeof value === "string" &&
        Number.isFinite(Date.parse(value)) &&
        Date.parse(value) <= now,
    ),
  ) as Record<string, string>;
}
/** The game an Odds API event is for (same matching as upcomingPropEvents). */
export const gameForEvent = (event: Event, games: Game[]) =>
  games.find(
    (g) =>
      g.home_team === event.home_team &&
      g.away_team === event.away_team &&
      Math.abs(Date.parse(g.kickoff) - Date.parse(event.commence_time)) <
        3600000,
  );
export function propObservations(
  event: Parameters<typeof oddsObservations>[0][number],
  games: Game[],
  now: number,
) {
  const filtered = {
    ...event,
    bookmakers: (event.bookmakers || []).map((b) => ({
      ...b,
      markets: b.markets.filter((m) => PICK_PROP_MARKETS.includes(m.key)),
    })),
  };
  return oddsObservations([filtered], games)
    .filter((o) => {
      const at = Date.parse(o.observed_at || "");
      return (
        Number.isFinite(at) &&
        at <= now &&
        o.payload.outcomes.every(
          (x) =>
            ["Over", "Under"].includes(x.name) &&
            Boolean(x.description?.trim()) &&
            Number.isFinite(x.point) &&
            x.point! >= 0 &&
            Number.isFinite(x.price) &&
            Math.abs(x.price) >= 100,
        )
      );
    })
    .map((o) => ({
      ...o,
      source: `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds`,
      payload: {
        ...o.payload,
        kickoff: event.commence_time,
        home_team: event.home_team,
        away_team: event.away_team,
      },
    }));
}
