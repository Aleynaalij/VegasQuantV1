import { oddsObservations } from "./normalize.ts";
type Game = { id: string; home_team: string; away_team: string; kickoff: string };
type Event = { id: string; home_team: string; away_team: string; commence_time: string };
export function upcomingPropEvents(events: Event[], games: Game[], now: number, limit = 24) {
  const eligible = events.filter(e => /^[a-zA-Z0-9_-]+$/.test(e.id) &&
    Date.parse(e.commence_time) > now && Date.parse(e.commence_time) <= now + 7*86400000 &&
    games.some(g => g.home_team === e.home_team && g.away_team === e.away_team &&
      Math.abs(Date.parse(g.kickoff)-Date.parse(e.commence_time)) < 3600000))
    .sort((a,b) => Date.parse(a.commence_time)-Date.parse(b.commence_time));
  const unique = [...new Map(eligible.map(e => [e.id,e])).values()];
  return { events: unique.slice(0,limit), skipped: Math.max(0,unique.length-limit) };
}
export function propObservations(event: Parameters<typeof oddsObservations>[0][number], games: Game[], now: number) {
  const filtered = { ...event, bookmakers: (event.bookmakers || []).map(b => ({ ...b,
    markets: b.markets.filter(m => ["player_rush_yds","player_reception_yds"].includes(m.key)) })) };
  return oddsObservations([filtered],games).filter(o => {
    const at = Date.parse(o.observed_at || "");
    return Number.isFinite(at) && at <= now && o.payload.outcomes.every(x =>
      ["Over","Under"].includes(x.name) && Boolean(x.description?.trim()) &&
      Number.isFinite(x.point) && x.point! >= 0 && Number.isFinite(x.price) && Math.abs(x.price)>=100);
  }).map(o => ({ ...o, source: `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds`,
    payload: { ...o.payload, kickoff: event.commence_time, home_team: event.home_team, away_team: event.away_team } }));
}
