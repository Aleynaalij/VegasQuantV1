import type {
  NewSport,
  SportGame,
  SportMarket,
  SportSource,
  SportTeam,
} from "../../../src/lib/sport-contract.ts";
export const paths = {
  nhl: "hockey/nhl",
  ncaab: "basketball/mens-college-basketball",
} as const;
export const oddsKeys = {
  nhl: "icehockey_nhl",
  ncaab: "basketball_ncaab",
} as const;
export const allowedMarkets = {
  nhl: [
    "h2h",
    "totals",
    "player_points",
    "player_goals",
    "player_goal_scorer_anytime",
  ],
  ncaab: ["h2h", "spreads"],
} as const;
export const sha256 = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
const obj = (v: unknown): Record<string, any> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, any>)
    : {};
const array = (v: unknown): Record<string, any>[] =>
  Array.isArray(v) ? v.map(obj) : [];
const meta = (s: SportSource): SportSource => ({
  url: s.url,
  sha256: s.sha256,
  retrieved_at: s.retrieved_at,
});
const integer = (v: unknown) =>
  v !== null && v !== undefined && /^\d+$/.test(String(v)) ? Number(v) : null;
const iso = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
const team = (v: Record<string, any>, sport: NewSport): SportTeam | null =>
  /^\d+$/.test(String(v.id)) && v.displayName
    ? {
        id: `${sport}:espn:${v.id}`,
        provider_id: String(v.id),
        name: v.displayName,
        short_name: v.shortDisplayName || v.displayName,
        abbreviation: v.abbreviation || v.shortDisplayName || v.displayName,
      }
    : null;
/** Probe completeness before storing: ESPN reports pagination via leagues/eventsCount on some feeds. */
export function scoreboardGames(
  data: unknown,
  sport: NewSport,
  source: SportSource,
): Omit<SportGame, "id">[] {
  const d = obj(data);
  const events = array(d.events);
  if (events.length >= 1000) throw Error("Schedule pagination limit reached");
  return events.flatMap((e) => {
    const c = array(e.competitions)[0],
      s = obj(e.season);
    if (!c || ![2, 3].includes(s.type) || !/^\d+$/.test(String(e.id)))
      return [];
    const away = team(
        obj(array(c.competitors).find((t) => t.homeAway === "away")?.team),
        sport,
      ),
      home = team(
        obj(array(c.competitors).find((t) => t.homeAway === "home")?.team),
        sport,
      );
    const start = iso(c.date || e.date),
      status = obj(obj(c.status).type);
    if (
      !away ||
      !home ||
      away.id === home.id ||
      !start ||
      !Number.isInteger(s.year)
    )
      return [];
    const score = (side: string) =>
      status.state === "pre"
        ? null
        : integer(array(c.competitors).find((t) => t.homeAway === side)?.score);
    return [
      {
        sport,
        provider_id: String(e.id),
        slug: `${away.abbreviation}-${home.abbreviation}-${e.id}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, ""),
        away,
        home,
        start_time: start,
        start_time_tbd: c.timeValid === false,
        season: s.year,
        season_type: s.type,
        venue: c.venue?.fullName || null,
        neutral_site: typeof c.neutralSite === "boolean" ? c.neutralSite : null,
        status: status.name || "UNKNOWN",
        completed: status.completed === true,
        away_score: score("away"),
        home_score: score("home"),
        source: meta(source),
        updated_at: source.retrieved_at,
      },
    ];
  });
}
const key = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
/** Match names to the SAME pair and start, never fuzzy text. Short/team abbreviations are aliases. */
export function gameForEvent(e: any, games: SportGame[]) {
  const matches = (t: SportGame["home"], name: string) =>
    [t.name, t.short_name].some((n) => key(n) === key(name || ""));
  const candidates = games.filter((g) => {
    const same = matches(g.home, e.home_team) && matches(g.away, e.away_team);
    const neutralSwap =
      g.neutral_site === true &&
      matches(g.home, e.away_team) &&
      matches(g.away, e.home_team);
    return (
      (same || neutralSwap) &&
      Math.abs(Date.parse(g.start_time) - Date.parse(e.commence_time)) <=
        15 * 60000
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
}
/** The Odds API keys for the books we compare; FanDuel stays the book selections are priced at. */
export const BOOK_NAMES = {
  fanduel: "FanDuel",
  draftkings: "DraftKings",
  betmgm: "BetMGM",
  williamhill_us: "Caesars",
  betrivers: "BetRivers",
  fanatics: "Fanatics",
} as const;
export type BookKey = keyof typeof BOOK_NAMES;
/** One request covers all six books: up to ten bookmakers cost the same as one region. */
export const BOOKMAKERS = Object.keys(BOOK_NAMES).join(",");
export function normalizeMarkets(
  events: unknown,
  sport: NewSport,
  games: SportGame[],
  source: SportSource,
  now = Date.now(),
  bookKey: BookKey = "fanduel",
): Omit<SportMarket, "id">[] {
  const out: Omit<SportMarket, "id">[] = [];
  for (const e of array(Array.isArray(events) ? events : [events])) {
    if (e.sport_key !== oddsKeys[sport]) continue;
    const g = gameForEvent(e, games);
    if (
      !g ||
      Date.parse(g.start_time) <= now ||
      g.start_time_tbd ||
      g.completed
    )
      continue;
    for (const b of array(e.bookmakers).filter((b) => b.key === bookKey))
      for (const m of array(b.markets)) {
        if (!(allowedMarkets[sport] as readonly string[]).includes(m.key))
          continue;
        const at = iso(m.last_update || b.last_update);
        if (!at || Date.parse(at) > now || now - Date.parse(at) > 30 * 60000)
          continue;
        // A three-way market is not the requested overtime-inclusive NHL moneyline.
        if (
          m.key === "h2h" &&
          (array(m.outcomes).length !== 2 ||
            array(m.outcomes).some((o) => o.name === "Draw"))
        )
          continue;
        for (const o of array(m.outcomes)) {
          if (
            !Number.isInteger(o.price) ||
            Math.abs(o.price) < 100 ||
            Math.abs(o.price) > 100000
          )
            continue;
          const isPlayer = m.key.startsWith("player_"),
            side = [g.home.name, g.home.short_name].some(
              (n) => key(n) === key(o.name || ""),
            )
              ? "home"
              : [g.away.name, g.away.short_name].some(
                    (n) => key(n) === key(o.name || ""),
                  )
                ? "away"
                : null;
          const dir = ["Over", "Under", "Yes"].includes(o.name) ? o.name : null;
          if ((m.key === "h2h" || m.key === "spreads") && !side) continue;
          if (isPlayer && (!String(o.description || "").trim() || !dir))
            continue;
          if (m.key === "totals" && !["Over", "Under"].includes(o.name))
            continue;
          if (m.key === "player_goal_scorer_anytime" && o.name !== "Yes")
            continue;
          if (
            isPlayer &&
            m.key !== "player_goal_scorer_anytime" &&
            !["Over", "Under"].includes(o.name)
          )
            continue;
          const line =
            m.key === "h2h" || m.key === "player_goal_scorer_anytime"
              ? null
              : o.point;
          if (
            line !== null &&
            (!Number.isFinite(line) || (m.key !== "spreads" && line < 0))
          )
            continue;
          const settlement = isPlayer
            ? "skater_stats_excluding_shootout"
            : sport === "nhl"
              ? "including_overtime_shootout"
              : "including_overtime";
          out.push({
            game_id: g.id,
            sport,
            book: BOOK_NAMES[bookKey] as SportMarket["book"],
            market: m.key,
            period: "full_game",
            selection: isPlayer ? o.description : side ? g[side].name : o.name,
            player: isPlayer ? o.description : null,
            athlete_id: null,
            side,
            direction: dir,
            line,
            odds: o.price,
            observed_at: at,
            expires_at: new Date(
              Math.min(Date.parse(g.start_time), Date.parse(at) + 30 * 60000),
            ).toISOString(),
            settlement,
            settlement_note: isPlayer
              ? "Player must appear on ice; overtime counts, shootout goals excluded. Points = goals + assists."
              : sport === "nhl"
                ? "Full game including overtime and shootout; final official score."
                : "Full game including overtime; exact spread ties push.",
            source: meta(source),
          });
        }
      }
  }
  return out;
}
export function dates(now = Date.now(), back = 1, ahead = 7) {
  return Array.from({ length: back + ahead + 1 }, (_, i) =>
    new Date(now + (i - back) * 86400000)
      .toLocaleDateString("en-CA", { timeZone: "America/New_York" })
      .replaceAll("-", ""),
  );
}
export function scoreboardUrl(sport: NewSport, day: string) {
  return `https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/scoreboard?dates=${day}&limit=1000${sport === "ncaab" ? "&groups=50" : ""}`;
}
export function summaryUrl(sport: NewSport, id: string) {
  if (!/^\d+$/.test(id)) throw Error("Invalid event id");
  return `https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/summary?event=${id}`;
}

export type BookSnapshot = {
  game_id: string;
  book: string;
  market: string;
  observed_at: string;
  outcomes: {
    name: string;
    description?: string;
    point?: number;
    price: number;
  }[];
};
/**
 * The other five books' quotes, held to exactly FanDuel's matching and validation, as one snapshot
 * per game, book and market. Outcomes are keyed the way Vegas Quant compares them: the side (home or
 * away) or direction (Over, Under, Yes), the player and the line.
 */
export function bookSnapshots(
  events: unknown,
  sport: NewSport,
  games: SportGame[],
  source: SportSource,
  now = Date.now(),
): BookSnapshot[] {
  const out = new Map<string, BookSnapshot>();
  for (const bookKey of Object.keys(BOOK_NAMES) as BookKey[]) {
    if (bookKey === "fanduel") continue;
    for (const m of normalizeMarkets(
      events,
      sport,
      games,
      source,
      now,
      bookKey,
    )) {
      const k = JSON.stringify([m.game_id, bookKey, m.market]);
      const snap = out.get(k) || {
        game_id: m.game_id,
        book: BOOK_NAMES[bookKey],
        market: m.market,
        observed_at: m.observed_at,
        outcomes: [],
      };
      if (m.observed_at > snap.observed_at) snap.observed_at = m.observed_at;
      snap.outcomes.push({
        name: (m.side || m.direction)!,
        ...(m.player ? { description: m.player } : {}),
        ...(m.line === null ? {} : { point: m.line }),
        price: m.odds,
      });
      out.set(k, snap);
    }
  }
  return [...out.values()];
}
