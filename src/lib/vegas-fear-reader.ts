import { supabase } from "./supabase";
import {
  fearEvidence,
  fearSource,
  historyHours,
  type FearEvent,
  type FearRow,
  type FearSport,
} from "./vegas-fear";

const fields =
  "id,game_id,kind,provider,source,observed_at,recorded_at,payload";
const cap = 500;
const scheduleCap = 250;
const contextCap = 100;
const day = 86_400_000;

export async function fearAccess() {
  const session = await supabase.auth.getSession();
  if (session.error) throw session.error;
  if (!session.data.session) return "signed-out" as const;
  const access = await supabase.rpc("membership_status");
  if (access.error) throw access.error;
  return access.data?.allowed === true
    ? ("allowed" as const)
    : ("denied" as const);
}

export async function fearSchedule(sport: "nfl" | "nba", now: number) {
  const start = sport === "nfl" ? "kickoff" : "tipoff";
  let query = supabase
    .from(sport === "nfl" ? "games" : "nba_games")
    .select(`id,home_team,away_team,${start},${start}_tbd`)
    .gt(start, new Date(now).toISOString())
    .lte(start, new Date(now + 7 * day).toISOString())
    .order(start)
    .order("id")
    .limit(scheduleCap + 1);
  if (sport === "nfl") query = query.eq("sport", "nfl");
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data || []) as unknown as Record<string, unknown>[];
  const events: FearEvent[] = rows.slice(0, scheduleCap).flatMap((row) => {
    const id = row.id,
      home = row.home_team,
      away = row.away_team,
      time = row[start];
    if (
      typeof id !== "string" ||
      typeof home !== "string" ||
      typeof away !== "string" ||
      typeof time !== "string" ||
      !Number.isFinite(Date.parse(time))
    )
      return [];
    return [
      {
        id,
        sport,
        home,
        away,
        start: time,
        tbd: row[start + "_tbd"] !== false,
      },
    ];
  });
  return { events, truncated: rows.length > scheduleCap };
}

export async function fearDetail(
  event: FearEvent,
  now: number,
  client = supabase,
) {
  const table =
    event.sport === "nfl" ? "source_observations" : "nba_observations";
  const [market, context] = await Promise.all([
    client
      .from(table)
      .select(fields)
      .eq("game_id", event.id)
      .in("kind", event.sport === "nfl" ? ["odds"] : ["odds", "prop"])
      .gte(
        "recorded_at",
        new Date(now - (historyHours * day) / 24).toISOString(),
      )
      .order("observed_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(cap + 1),
    client
      .from(table)
      .select(fields)
      .eq("game_id", event.id)
      .eq("kind", "injury")
      .order("observed_at", { ascending: false, nullsFirst: false })
      .order("id")
      .limit(contextCap + 1),
  ]);
  const rows = (market.data || []) as FearRow[];
  const contextRows = (context.data || []) as FearRow[];
  const seen = new Set<string>();
  const reports = contextRows.slice(0, contextCap).flatMap((row) => {
    if (row.game_id !== event.id || row.kind !== "injury") return [];
    const { player, team, status } = row.payload;
    const observed = Date.parse(row.observed_at || "");
    const source = fearSource(row.source);
    if (
      !source ||
      !Number.isFinite(observed) ||
      observed > now ||
      typeof player !== "string" ||
      typeof team !== "string" ||
      typeof status !== "string" ||
      !player.trim() ||
      !status.trim()
    )
      return [];
    const key = JSON.stringify([team, player]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ player, team, status, observed, source }];
  });
  return {
    evidence: fearEvidence(event, rows.slice(0, cap), now),
    marketError: !!market.error,
    contextError: !!context.error,
    marketTruncated: rows.length > cap,
    contextTruncated: contextRows.length > contextCap,
    reports,
    fetchedAt: now,
  };
}

export function supportedFearSport(sport: FearSport): sport is "nfl" | "nba" {
  return sport === "nfl" || sport === "nba";
}
