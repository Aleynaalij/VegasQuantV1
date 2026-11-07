import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { nbaLogoCode } from "./nba-home";
import { nbaSheetAvailability } from "./nba-matchup-sheet";

const GAME_FIELDS =
  "id,provider_id,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season,season_type,status,away_score,home_score";
export type SheetGame = {
  id: string;
  provider_id: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string;
  home_abbreviation: string;
  tipoff: string;
  tipoff_tbd: boolean;
  venue: string | null;
  season: number;
  season_type: number;
  status: string;
  away_score: number | null;
  home_score: number | null;
};
type Box = {
  game_id: string;
  athlete_id: string;
  side: "away" | "home";
  player: string;
  position: string | null;
  minutes: number | null;
  points: number | null;
  rebounds: number | null;
  assists: number | null;
  threes: number | null;
  steals: number | null;
  blocks: number | null;
  turnovers: number | null;
};
type Attempt = { game_id: string; athlete_id: string; attempts: number | null };
const stats = [
  "minutes",
  "points",
  "rebounds",
  "assists",
  "threes",
  "attempts",
  "steals",
  "blocks",
  "turnovers",
] as const;
type Stat = (typeof stats)[number];
export type Player = {
  name: string;
  position: string;
  games: number;
  stats: Record<Stat, number | null>;
  lastPoints: (number | null)[];
};
type Final = {
  opponent: string;
  points: number;
  against: number;
  won: boolean;
  box: Record<Stat, number | null>;
  providerId: string;
};
export type Team = {
  name: string;
  code: string;
  logo: string | null;
  finals: Final[];
  players: Player[];
};

const markets = [
  "h2h",
  "spreads",
  "totals",
  "player_points",
  "player_rebounds",
] as const;
type Market = (typeof markets)[number];
export type Outcome = {
  name: string;
  price: number;
  point?: number;
  description?: string;
};
export type Quote = { time: string; outcomes: Outcome[] };
type QuoteRow = { observed_at: string; payload: unknown };
export type Sheet = {
  game: SheetGame;
  teams: [Team, Team];
  quotes: Partial<Record<Market, Quote>>;
  availability: ReturnType<typeof nbaSheetAvailability>;
  cutoff: string;
};

const key = (game: string, player: string) => `${game}:${player}`;
export const sheetPlayerKey = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
const mean = (values: (number | null)[]) =>
  values.length &&
  values.every((n): n is number => typeof n === "number" && Number.isFinite(n))
    ? values.reduce((sum, n) => sum + n, 0) / values.length
    : null;
export const teamMean = (team: Team, stat: Stat) =>
  mean(team.finals.map((g) => g.box[stat]));

async function logo(abbr: string) {
  const code = nbaLogoCode(abbr);
  if (!code) return null;
  try {
    const response = await fetch(
      `https://a.espncdn.com/i/teamlogos/nba/500/${code}.png`,
      {
        redirect: "error",
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(2200),
      },
    );
    if (!response.ok) return null;
    const bytes = await sharp(Buffer.from(await response.arrayBuffer()), {
      limitInputPixels: 1_000_000,
    })
      .resize(140, 140, { fit: "inside" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export function readSheetQuote(
  row: QuoteRow | null,
  game: SheetGame,
  market: Market,
): Quote | null {
  if (!row || !Number.isFinite(Date.parse(row.observed_at))) return null;
  const p = row.payload as Record<string, unknown> | null;
  if (
    !p ||
    p.book !== "FanDuel" ||
    p.market !== market ||
    p.away_team !== game.away_team ||
    p.home_team !== game.home_team ||
    !Array.isArray(p.outcomes)
  )
    return null;
  const outcomes: Outcome[] = p.outcomes
    .filter(
      (o): o is Outcome =>
        o &&
        typeof o.name === "string" &&
        o.name.length <= 80 &&
        Number.isInteger(o.price) &&
        Math.abs(o.price) >= 100 &&
        (market === "h2h" || Number.isFinite(o.point)) &&
        (!market.startsWith("player_") ||
          (typeof o.description === "string" && o.description.length <= 80)),
    )
    .map(({ name, price, point, description }) => ({
      name,
      price,
      point,
      description,
    }));
  return outcomes.length ? { time: row.observed_at, outcomes } : null;
}

function profile(
  game: SheetGame,
  side: "away" | "home",
  history: SheetGame[],
  boxes: Box[],
  shots: Attempt[],
  image: string | null,
): Team {
  const name = game[`${side}_team`],
    code = game[`${side}_abbreviation`];
  const attempts = new Map(
    shots.map((row) => [key(row.game_id, row.athlete_id), row.attempts]),
  );
  const playerRows = new Map<string, (Box & { attempts: number | null })[]>();
  const finals: Final[] = history.flatMap((g) => {
    const teamSide = g.away_abbreviation === code ? "away" : "home";
    const other = teamSide === "away" ? "home" : "away";
    const points = g[`${teamSide}_score`],
      against = g[`${other}_score`];
    if (points === null || against === null) return [];
    const rows = boxes
      .filter((b) => b.game_id === g.id && b.side === teamSide)
      .map((b) => ({
        ...b,
        attempts: attempts.get(key(b.game_id, b.athlete_id)) ?? null,
      }));
    for (const b of rows) {
      const player = playerRows.get(b.athlete_id) ?? [];
      player.push(b);
      playerRows.set(b.athlete_id, player);
    }
    const box = Object.fromEntries(
      stats.map((stat) => {
        const values = rows.map((r) => r[stat]);
        const avg = mean(values);
        return [stat, avg === null ? null : avg * values.length];
      }),
    ) as Final["box"];
    return [
      {
        points,
        against,
        won: points > against,
        opponent: g[`${other}_abbreviation`],
        box,
        providerId: g.provider_id,
      },
    ];
  });
  const players = [...playerRows.values()]
    .map((rows) => ({
      name: rows[0].player,
      position: rows[0].position ?? "—",
      games: rows.length,
      stats: Object.fromEntries(
        stats.map((s) => [s, mean(rows.map((b) => b[s]))]),
      ) as Player["stats"],
      lastPoints: rows.map((b) => b.points),
    }))
    .sort(
      (a, b) =>
        (b.stats.minutes ?? 0) - (a.stats.minutes ?? 0) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 10);
  return { name, code, logo: image, finals, players };
}

export async function loadNbaMatchupSheet(
  db: SupabaseClient,
  slug: string,
  body: string,
): Promise<Sheet | null> {
  const target = await db
    .from("nba_games")
    .select(GAME_FIELDS)
    .eq("slug", slug)
    .maybeSingle<SheetGame>();
  if (target.error) throw target.error;
  const game = target.data;
  if (
    !game ||
    game.season_type !== 2 ||
    game.tipoff_tbd ||
    !Number.isFinite(Date.parse(game.tipoff))
  )
    return null;
  const cutoff = new Date(
    Math.min(Date.now(), Date.parse(game.tipoff)),
  ).toISOString();
  const histories = await Promise.all(
    (["away", "home"] as const).map((side) => {
      const code = game[`${side}_abbreviation`];
      if (!/^[A-Z]{2,4}$/.test(code)) throw Error("Invalid team abbreviation");
      return db
        .from("nba_games")
        .select(GAME_FIELDS)
        .eq("season", game.season)
        .eq("season_type", 2)
        .eq("status", "STATUS_FINAL")
        .lt("tipoff", cutoff)
        .or(`away_abbreviation.eq.${code},home_abbreviation.eq.${code}`)
        .order("tipoff", { ascending: false })
        .order("id")
        .limit(5)
        .returns<SheetGame[]>();
    }),
  );
  if (histories.some((r) => r.error)) throw Error("Game history unavailable");
  const [away, home] = histories.map((r) => r.data ?? []);
  const ids = [...new Set([...away, ...home].map((g) => g.id))];
  const [box, shots, observed, awayLogo, homeLogo] = await Promise.all([
    ids.length
      ? db
          .from("nba_player_results")
          .select(
            "game_id,athlete_id,side,player,position,minutes,points,rebounds,assists,threes,steals,blocks,turnovers",
          )
          .in("game_id", ids)
          .eq("played", true)
          .returns<Box[]>()
      : { data: [] as Box[], error: null },
    ids.length
      ? db
          .from("nba_player_three_attempts")
          .select("game_id,athlete_id,attempts")
          .in("game_id", ids)
          .returns<Attempt[]>()
      : { data: [] as Attempt[], error: null },
    Promise.all(
      markets.map(async (market) => {
        const r = await db
          .from("nba_observations")
          .select("observed_at,payload")
          .eq("game_id", game.id)
          .eq("kind", market.startsWith("player_") ? "prop" : "odds")
          .eq("payload->>book", "FanDuel")
          .eq("payload->>market", market)
          .lte("observed_at", cutoff)
          .lte("recorded_at", cutoff)
          .order("observed_at", { ascending: false })
          .order("recorded_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle<QuoteRow>();
        if (r.error) throw r.error;
        return [market, readSheetQuote(r.data, game, market)] as const;
      }),
    ),
    logo(game.away_abbreviation),
    logo(game.home_abbreviation),
  ]);
  if (box.error || shots.error) throw Error("Player box scores unavailable");
  return {
    game,
    teams: [
      profile(game, "away", away, box.data ?? [], shots.data ?? [], awayLogo),
      profile(game, "home", home, box.data ?? [], shots.data ?? [], homeLogo),
    ],
    quotes: Object.fromEntries(observed.filter(([, q]) => q !== null)),
    availability: nbaSheetAvailability(body),
    cutoff,
  };
}
