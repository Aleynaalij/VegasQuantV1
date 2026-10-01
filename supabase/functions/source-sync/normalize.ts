// Only provider facts. Never creates analyst projections, targets, picks or settlements.
type Event = {
  id: string;
  date: string;
  season: { year: number; type: number };
  week?: { number: number };
  competitions: Competition[];
  status?: unknown;
};
type Competitor = {
  homeAway: string;
  team: { displayName: string; abbreviation: string };
  score?: string;
};
type Competition = {
  timeValid?: boolean;
  competitors: Competitor[];
  venue?: { fullName: string; indoor?: boolean };
  status?: unknown;
  weather?: unknown;
};
export function gameWindow(iso: string) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(d);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(d),
  );
  return day === "Sunday"
    ? hour >= 19
      ? "Sunday Night Football"
      : hour >= 16
        ? "Sunday 4 PM"
        : hour >= 12
          ? "Sunday 1 PM"
          : "Sunday International"
    : day === "Thursday"
      ? "Thursday Night Football"
      : day === "Monday"
        ? "Monday Night Football"
        : day;
}
export function fixturesFromScoreboard(data: { events?: Event[] }) {
  return (data.events || []).flatMap((e) => {
    const c = e.competitions?.[0],
      home = c?.competitors.find((t) => t.homeAway === "home"),
      away = c?.competitors.find((t) => t.homeAway === "away");
    if (!home || !away || !e.date || !Number.isFinite(Date.parse(e.date)))
      return [];
    return [
      {
        provider_id: e.id,
        slug: `${away.team.abbreviation}-${home.team.abbreviation}-${e.season.year}-${e.season.type}-${e.week?.number || e.id}`.toLowerCase(),
        away_team: away.team.displayName,
        home_team: home.team.displayName,
        away_abbreviation: away.team.abbreviation,
        home_abbreviation: home.team.abbreviation,
        kickoff: e.date,
        kickoff_tbd: c.timeValid === false,
        venue: c.venue?.fullName || "TBA",
        roof:
          c.venue?.indoor === true
            ? "Indoor"
            : c.venue?.indoor === false
              ? "Outdoor"
              : null,
        slot: gameWindow(e.date),
        season: e.season.year,
        week: e.week?.number,
        source: `https://www.espn.com/nfl/game/_/gameId/${e.id}`,
      },
    ];
  });
}
export function observationsFromScoreboard(data: { events?: Event[] }) {
  return (data.events || []).flatMap((e) => {
    const c = e.competitions?.[0];
    if (!c) return [];
    const source = `https://www.espn.com/nfl/game/_/gameId/${e.id}`;
    const rows = [
      {
        provider_id: e.id,
        kind: "schedule",
        source,
        observed_at: null,
        fingerprint: "",
        payload: {
          kickoff: e.date,
          time_valid: c.timeValid,
          venue: c.venue?.fullName,
          status: c.status || e.status,
        },
      },
    ];
    rows.push({
      provider_id: e.id,
      kind: "score",
      source,
      observed_at: null,
      fingerprint: "",
      payload: {
        status: c.status || e.status,
        ...Object.fromEntries(
          c.competitors.map((t) => [
            t.homeAway,
            { team: t.team.displayName, score: t.score },
          ]),
        ),
      } as never,
    });
    if (c.weather)
      rows.push({
        provider_id: e.id,
        kind: "weather",
        source,
        observed_at: null,
        fingerprint: "",
        payload: c.weather as never,
      });
    return rows;
  });
}
type OddsEvent = {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: {
    key: string;
    title: string;
    last_update: string;
    markets: {
      key: string;
      last_update?: string;
      outcomes: {
        name: string;
        price: number;
        point?: number;
        description?: string;
      }[];
    }[];
  }[];
};
export function oddsObservations(
  events: OddsEvent[],
  games: {
    id: string;
    home_team: string;
    away_team: string;
    kickoff: string;
  }[],
) {
  return events.flatMap((e) => {
    const g = games.find(
      (g) =>
        g.home_team === e.home_team &&
        g.away_team === e.away_team &&
        Math.abs(Date.parse(g.kickoff) - Date.parse(e.commence_time)) < 3600000,
    );
    if (!g) return [];
    return e.bookmakers
      .filter((b) => ["fanduel", "draftkings"].includes(b.key))
      .flatMap((b) =>
        b.markets.map((m) => ({
          game_id: g.id,
          kind: "odds",
          source: "https://the-odds-api.com",
          observed_at: m.last_update || b.last_update,
          fingerprint: "",
          payload: {
            event_id: e.id,
            book: b.title,
            market: m.key,
            outcomes: m.outcomes,
            provider_updated_at: m.last_update || b.last_update,
          },
        })),
      );
  });
}
type Fixture = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff: string;
};
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
export function injuryObservations(data: InjuryData, games: Fixture[]) {
  return (data.injuries || []).flatMap((team) =>
    games
      .filter(
        (g) =>
          g.home_team === team.displayName || g.away_team === team.displayName,
      )
      .flatMap((g) =>
        team.injuries
          .filter(
            (i) => i.status && i.status !== "Active" && i.athlete?.displayName,
          )
          .map((i) => ({
            game_id: g.id,
            kind: "injury",
            source: "https://www.espn.com/nfl/injuries",
            observed_at: i.date || null,
            fingerprint: "",
            payload: {
              team: team.displayName,
              player: i.athlete!.displayName,
              position: i.athlete?.position?.abbreviation,
              status: i.status,
              injury: i.details?.type || i.type?.description,
              location: i.details?.location,
              expected_return: i.details?.returnDate,
            },
          })),
      ),
  );
}
type NewsData = {
  articles?: {
    id: number;
    headline: string;
    published?: string;
    categories?: { type: string; description: string }[];
    links?: { web?: { href: string } };
  }[];
};
export function newsObservations(data: NewsData, games: Fixture[]) {
  return (data.articles || [])
    .filter((a) => a.links?.web?.href?.startsWith("https://www.espn.com/"))
    .flatMap((a) => {
      const teams =
        a.categories
          ?.filter((c) => c.type === "team")
          .map((c) => c.description) || [];
      return games
        .filter(
          (g) => teams.includes(g.home_team) || teams.includes(g.away_team),
        )
        .map((g) => ({
          game_id: g.id,
          kind: "news",
          source: a.links!.web!.href,
          observed_at: a.published || null,
          fingerprint: "",
          payload: { provider_article_id: a.id, headline: a.headline },
        }));
    });
}
