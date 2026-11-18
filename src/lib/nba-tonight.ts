/** Tonight's NBA slate for the research tab and the Prop Finder: season lines, injuries, FanDuel prop trends, every book's quotes. Browser-side reads only. */
import { supabase } from "@/lib/supabase";
import { nbaWhen } from "@/lib/nba-home";
import {
  allBookQuotes,
  latestInjuries,
  propQuotes,
  propTrends,
  seasonLines,
  type BookQuote,
  type BoxRow,
  type DefenseRow,
  type Injury,
  type PlayerLine,
  type PropTrend,
} from "@/lib/nba-research-tab";

export type SlateGame = {
  id: string;
  away_team: string;
  home_team: string;
  away_abbreviation: string | null;
  home_abbreviation: string | null;
  tipoff_tbd: boolean;
  tipoff: string;
  season: number | null;
};
type Observation = {
  game_id: string;
  kind: string;
  recorded_at: string;
  observed_at: string | null;
  payload: Record<string, unknown>;
};
export type Slate = {
  games: SlateGame[];
  lines: PlayerLine[];
  injuries: Map<string, Injury[]>;
  trends: Map<string, PropTrend[]>;
  propsAt: string | null;
  /** Defense vs position this season; empty until loaded or for visitors. */
  defense: DefenseRow[];
  /** Every book's latest points/rebounds quotes per game, for line shopping; members only. */
  quotes: Map<string, BookQuote[]>;
};
const HOUR = 3600000;
const etDay = (iso: string) =>
  nbaWhen(iso, { year: "numeric", month: "2-digit", day: "2-digit" });

/** Every row of a query, 1,000 at a time (the API's page size). */
async function all<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from, from + 999);
    if (r.error) throw r.error;
    rows.push(...(r.data || []));
    if ((r.data || []).length < 1000) return rows;
  }
}

/** Tonight's NBA slate with season lines, injuries, FanDuel prop trends and every book's quotes. */
export async function loadSlate(
  member: boolean,
  /** An nba_games id to load that game's Eastern day instead of tonight's (per-game links). */
  forGame?: string,
): Promise<Slate> {
  const now = Date.now();
  const upcoming = await supabase
    .from("nba_games")
    .select(
      "id,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,season",
    )
    .eq("season_type", 2)
    .gte("tipoff", new Date(now - 4 * HOUR).toISOString())
    .lte("tipoff", new Date(now + 36 * HOUR).toISOString())
    .order("tipoff");
  if (upcoming.error) throw upcoming.error;
  // Tonight's slate: every game on the Eastern date of the next game that has not finished. A
  // per-game link to a later day loads that game's day instead.
  let pool = upcoming.data || [];
  if (forGame && !pool.some((g) => g.id === forGame)) {
    const one = await supabase
      .from("nba_games")
      .select("tipoff")
      .eq("id", forGame)
      .maybeSingle();
    if (!one.error && one.data) {
      const day = await supabase
        .from("nba_games")
        .select(
          "id,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,season",
        )
        .eq("season_type", 2)
        .gte(
          "tipoff",
          new Date(Date.parse(one.data.tipoff) - 24 * HOUR).toISOString(),
        )
        .lte(
          "tipoff",
          new Date(Date.parse(one.data.tipoff) + 24 * HOUR).toISOString(),
        )
        .order("tipoff");
      if (day.error) throw day.error;
      pool = day.data || [];
    }
  }
  const anchor = pool.find((g) => g.id === forGame) || pool[0];
  const games = anchor
    ? pool.filter((g) => etDay(g.tipoff) === etDay(anchor.tipoff))
    : [];
  const first = games[0];
  if (!games.length)
    return {
      games,
      lines: [],
      injuries: new Map(),
      trends: new Map(),
      propsAt: null,
      defense: [],
      quotes: new Map(),
    };
  const teams = [...new Set(games.flatMap((g) => [g.away_team, g.home_team]))];
  // This season's finished games only, so "season" numbers reset at the season boundary.
  type Played = {
    id: string;
    tipoff: string;
    away_team: string;
    home_team: string;
    away_abbreviation: string | null;
    home_abbreviation: string | null;
  };
  const season = await all<Played>((from, to) => {
    const q = supabase
      .from("nba_games")
      .select(
        "id,tipoff,away_team,home_team,away_abbreviation,home_abbreviation",
      )
      .eq("season_type", 2)
      .lt("tipoff", new Date(now).toISOString());
    return (first.season == null ? q : q.eq("season", first.season))
      .order("id")
      .range(from, to);
  });
  // Confirmed results only, as recorded form counts them. Minor ESPN revisions keep a game FINAL
  // (20261118010000); a game still in CONFLICT has a larger dispute and does not count.
  const confirmed = new Set(
    (
      await all<{ game_id: string }>((from, to) =>
        supabase
          .from("nba_result_progress")
          .select("game_id")
          .eq("status", "FINAL")
          .order("game_id")
          .range(from, to),
      )
    ).map((p) => p.game_id),
  );
  const played = new Map(
    season.filter((g) => confirmed.has(g.id)).map((g) => [g.id, g]),
  );
  type Row = Omit<BoxRow, "tipoff"> & { game_id: string };
  const columns =
    "game_id,athlete_id,player,team,played,minutes,points,rebounds,assists,threes,position";
  // Everyone who has played for tonight's teams, then each of those players' full history (traded
  // players keep the games they played elsewhere); a player's team is the one in his latest game.
  const onTeams = await all<{ athlete_id: string | number }>((from, to) =>
    supabase
      .from("nba_player_results")
      .select("athlete_id")
      .in("team", teams)
      .eq("played", true)
      .order("game_id")
      .order("athlete_id")
      .range(from, to),
  );
  const athletes = [...new Set(onTeams.map((r) => String(r.athlete_id)))];
  const box: Row[] = [];
  const attempts = new Map<string, number>();
  for (let i = 0; i < athletes.length; i += 150) {
    const ids = athletes.slice(i, i + 150);
    for (const a of await all<{
      game_id: string;
      athlete_id: string;
      attempts: number;
    }>((from, to) =>
      supabase
        .from("nba_player_three_attempts")
        .select("game_id,athlete_id,attempts")
        .in("athlete_id", ids)
        .order("game_id")
        .order("athlete_id")
        .range(from, to),
    ))
      attempts.set(`${a.game_id}:${a.athlete_id}`, a.attempts);
    box.push(
      ...(await all<Row>((from, to) =>
        supabase
          .from("nba_player_results")
          .select(columns)
          .in("athlete_id", ids)
          .eq("played", true)
          .order("game_id")
          .order("athlete_id")
          .range(from, to),
      )),
    );
  }
  // Usage per player game, and defense vs position, for members only (props are members-only too).
  const usage = new Map<string, number>();
  let defense: DefenseRow[] = [];
  if (member) {
    type Usage = {
      game_id: string;
      athlete_id: string;
      usage: number | string;
    };
    const [u, d] = await Promise.all([
      all<Usage>((from, to) =>
        supabase
          .rpc("nba_player_usage", { p_athletes: athletes })
          .order("game_id")
          .order("athlete_id")
          .range(from, to),
      ).catch(() => [] as Usage[]),
      first.season == null
        ? Promise.resolve({ data: [], error: null })
        : supabase.rpc("nba_defense_vs_position", { p_season: first.season }),
    ]);
    // Both are extras for the prop card: a failure leaves the card without them, not the tab broken.
    for (const r of u)
      usage.set(`${r.game_id}:${r.athlete_id}`, Number(r.usage));
    defense = ((d.error ? [] : d.data || []) as DefenseRow[]).map((r) => ({
      ...r,
      points: Number(r.points),
      rebounds: Number(r.rebounds),
    }));
  }
  const lines = seasonLines(
    box
      .filter((r) => played.has(r.game_id))
      .map((r) => {
        const g = played.get(r.game_id)!;
        const home = r.team === g.home_team;
        return {
          ...r,
          athlete_id: String(r.athlete_id),
          three_attempts:
            attempts.get(`${r.game_id}:${String(r.athlete_id)}`) ?? null,
          tipoff: g.tipoff,
          home,
          opponent: home ? g.away_team : g.home_team,
          opponent_abbr: home ? g.away_abbreviation : g.home_abbreviation,
          usage: usage.get(`${r.game_id}:${String(r.athlete_id)}`) ?? null,
        };
      }),
  ).filter((l) => teams.includes(l.team));
  const injuries = new Map<string, Injury[]>();
  const trends = new Map<string, PropTrend[]>();
  let propsAt: string | null = null;
  const quotes = new Map<string, BookQuote[]>();
  if (member) {
    // Injury reports and every book's props, each read in full (paged), so no book crowds out another.
    const observations = (kind: "injury" | "prop") =>
      all<Observation>((from, to) => {
        const q = supabase
          .from("nba_observations")
          .select("game_id,kind,recorded_at,observed_at,payload")
          .in(
            "game_id",
            games.map((g) => g.id),
          )
          .eq("kind", kind);
        return q
          .order("recorded_at", { ascending: false })
          .order("id")
          .range(from, to);
      });
    const rows = [
      ...(await observations("injury")),
      ...(await observations("prop")),
    ];
    for (const injury of latestInjuries(
      rows.filter((r) => r.kind === "injury"),
    ))
      injuries.set(injury.team, [...(injuries.get(injury.team) || []), injury]);
    for (const g of games) {
      const props = rows.filter(
        (r) =>
          r.kind === "prop" &&
          r.game_id === g.id &&
          r.payload?.book === "FanDuel",
      );
      if (props[0] && (!propsAt || props[0].recorded_at > propsAt))
        propsAt = props[0].recorded_at;
      const gameLines = lines.filter(
        (l) => l.team === g.away_team || l.team === g.home_team,
      );
      quotes.set(
        g.id,
        allBookQuotes(
          rows.filter((r) => r.kind === "prop" && r.game_id === g.id) as {
            recorded_at: string;
            observed_at: string | null;
            payload: Parameters<typeof propQuotes>[0][number]["payload"];
          }[],
          Date.now(),
        ),
      );
      trends.set(
        g.id,
        propTrends(
          propQuotes(
            props as {
              recorded_at: string;
              payload: Parameters<typeof propQuotes>[0][number]["payload"];
            }[],
          ),
          gameLines,
        ),
      );
    }
  }
  return { games, lines, injuries, trends, propsAt, defense, quotes };
}

/** NBA research tab: tonight's slate, injuries, double-double rates and prop trends. Never picks. */
