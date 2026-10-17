// NBA provider facts only (schedule, scores, injuries, prices). Never creates projections, picks or
// settlements. Kept separate from the NFL feed: NBA rows go to nba_games / nba_observations.
type Competitor = {
  homeAway: string;
  team: { displayName: string; abbreviation: string };
  score?: string;
};
type StatusType = { name?: string; completed?: boolean; state?: string };
type Event = {
  id: string;
  date: string;
  season?: { year: number; type: number };
  status?: { type?: StatusType; period?: number };
  competitions: {
    timeValid?: boolean;
    competitors: Competitor[];
    venue?: { fullName: string };
    status?: { type?: StatusType; period?: number };
  }[];
};

/** ESPN and The Odds API spell one team differently; game matching uses the Odds API name. */
const ALIASES: Record<string, string> = { "LA Clippers": "Los Angeles Clippers" };
export const canonicalTeam = (name: string) => ALIASES[name?.trim()] || name?.trim();

const ymdEastern = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso))
    .replaceAll("-", "");

export const gameSource = (id: string) => `https://www.espn.com/nba/game/_/gameId/${id}`;

export function gamesFromScoreboard(data: { events?: Event[] }) {
  return (data.events || []).flatMap((e) => {
    const c = e.competitions?.[0],
      home = c?.competitors.find((t) => t.homeAway === "home"),
      away = c?.competitors.find((t) => t.homeAway === "away");
    if (!/^\d+$/.test(e.id || "") || !home || !away || !Number.isFinite(Date.parse(e.date))) return [];
    const status = c.status?.type || e.status?.type;
    const started = status?.state === "in" || status?.state === "post" || status?.completed === true;
    const score = (t: Competitor) => (started && /^\d+$/.test(t.score || "") ? Number(t.score) : null);
    return [
      {
        provider_id: e.id,
        slug: `${away.team.abbreviation}-${home.team.abbreviation}-${ymdEastern(e.date)}`.toLowerCase(),
        away_team: canonicalTeam(away.team.displayName),
        home_team: canonicalTeam(home.team.displayName),
        away_abbreviation: away.team.abbreviation,
        home_abbreviation: home.team.abbreviation,
        tipoff: e.date,
        tipoff_tbd: c.timeValid === false,
        venue: c.venue?.fullName || null,
        season: e.season?.year ?? null,
        season_type: e.season?.type ?? null,
        status: status?.name || null,
        away_score: score(away),
        home_score: score(home),
        source: gameSource(e.id),
      },
    ];
  });
}

export function observationsFromScoreboard(data: { events?: Event[] }) {
  return (data.events || []).flatMap((e) => {
    const c = e.competitions?.[0];
    if (!/^\d+$/.test(e.id || "") || !c) return [];
    const source = gameSource(e.id);
    const status = c.status || e.status;
    return [
      { provider_id: e.id, kind: "schedule", source, observed_at: null, fingerprint: "",
        payload: { tipoff: e.date, time_valid: c.timeValid, venue: c.venue?.fullName, status } },
      { provider_id: e.id, kind: "score", source, observed_at: null, fingerprint: "",
        payload: { status, ...Object.fromEntries(c.competitors.map((t) => [t.homeAway, { team: canonicalTeam(t.team.displayName), score: t.score }])) } },
    ];
  });
}

type Fixture = { id?: string; provider_id: string; home_team: string; away_team: string; tipoff: string };
type InjuryData = {
  injuries?: {
    displayName: string;
    injuries: {
      status?: string;
      date?: string;
      athlete?: { displayName?: string; position?: { abbreviation?: string } };
      type?: { description?: string };
      details?: { type?: string; location?: string; returnDate?: string };
    }[];
  }[];
};
/** Reported injuries for teams playing in the next `horizon` ms. Missing from the list is not clearance. */
export function injuryObservations(data: InjuryData, games: Fixture[], now: number, horizon = 48 * 3600000) {
  const soon = games.filter((g) => {
    const t = Date.parse(g.tipoff);
    return t > now && t <= now + horizon;
  });
  return (data.injuries || []).flatMap((team) => {
    const name = canonicalTeam(team.displayName);
    return soon
      .filter((g) => g.home_team === name || g.away_team === name)
      .flatMap((g) =>
        (team.injuries || [])
          .filter((i) => i.status && i.status !== "Active" && i.athlete?.displayName)
          .map((i) => ({
            provider_id: g.provider_id,
            kind: "injury",
            source: "https://www.espn.com/nba/injuries",
            observed_at: i.date || null,
            fingerprint: "",
            payload: {
              team: name,
              player: i.athlete!.displayName,
              position: i.athlete?.position?.abbreviation,
              status: i.status,
              injury: i.details?.type || i.type?.description,
              location: i.details?.location,
              expected_return: i.details?.returnDate,
            },
          })),
      );
  });
}

/** Same six books as the NFL feed (one Odds API region's cost). */
export const BOOKMAKERS = ["fanduel", "draftkings", "betmgm", "williamhill_us", "betrivers", "fanatics"];
export const BOOK_TITLES = ["FanDuel", "DraftKings", "BetMGM", "Caesars", "BetRivers", "Fanatics"];
export const GAME_MARKETS = ["h2h", "spreads", "totals"];
/** Default prop set: points, rebounds, assists and threes main lines (see migration settings). */
export const DEFAULT_PROP_MARKETS = ["player_points", "player_rebounds", "player_assists", "player_threes"];

export type OddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: {
    key: string;
    title: string;
    last_update: string;
    markets: { key: string; last_update?: string; outcomes: { name: string; price: number; point?: number; description?: string }[] }[];
  }[];
};

/** The NBA game an Odds API event is for: same teams, tip within an hour. */
export const gameForEvent = <G extends Fixture>(e: Pick<OddsEvent, "home_team" | "away_team" | "commence_time">, games: G[]) =>
  games.find(
    (g) =>
      g.home_team === canonicalTeam(e.home_team) &&
      g.away_team === canonicalTeam(e.away_team) &&
      Math.abs(Date.parse(g.tipoff) - Date.parse(e.commence_time)) < 3600000,
  );

const validProp = (x: { name: string; price: number; point?: number; description?: string }) =>
  ["Over", "Under"].includes(x.name) &&
  Boolean(x.description?.trim()) &&
  Number.isFinite(x.point) &&
  x.point! >= 0 &&
  Number.isFinite(x.price) &&
  Math.abs(x.price) >= 100;

/** Game lines (kind odds) or player props (kind prop), one observation per book and market. */
export function priceObservations(events: OddsEvent[], games: Fixture[], kind: "odds" | "prop", markets: string[], now: number) {
  return events.flatMap((e) => {
    const g = gameForEvent(e, games);
    if (!g || !/^[a-zA-Z0-9_-]+$/.test(e.id)) return [];
    const source =
      kind === "prop"
        ? `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${e.id}/odds`
        : "https://api.the-odds-api.com/v4/sports/basketball_nba/odds";
    return (e.bookmakers || [])
      .filter((b) => BOOKMAKERS.includes(b.key))
      .flatMap((b) =>
        b.markets
          .filter((m) => markets.includes(m.key))
          .map((m) => ({ b, m, at: m.last_update || b.last_update })),
      )
      .filter(({ m, at }) => {
        const t = Date.parse(at || "");
        return Number.isFinite(t) && t <= now && (kind === "odds" || (m.outcomes.length > 0 && m.outcomes.every(validProp)));
      })
      .map(({ b, m, at }) => ({
        provider_id: g.provider_id,
        kind,
        source,
        observed_at: at,
        fingerprint: "",
        payload: {
          event_id: e.id,
          book: b.title,
          market: m.key,
          outcomes: m.outcomes,
          provider_updated_at: at,
          tipoff: e.commence_time,
          home_team: canonicalTeam(e.home_team),
          away_team: canonicalTeam(e.away_team),
        },
      }));
  });
}

/** Scoreboard dates, yesterday through a week ahead (Eastern). ESPN's NBA scoreboard rejects date
 *  ranges with HTTP 400 (verified October 17, 2026), so each day is requested on its own. */
export function scoreboardDates(now: number) {
  return Array.from({ length: 9 }, (_, i) => ymdEastern(new Date(now + (i - 1) * 86400000).toISOString()));
}

/** One scoreboard from several daily responses; an event seen twice is kept once. */
export function mergeScoreboards(boards: { events?: Event[] }[]) {
  return { events: [...new Map(boards.flatMap((b) => b.events || []).map((e) => [e.id, e])).values()] };
}
