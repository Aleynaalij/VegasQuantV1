import { supabase } from "./supabase";
import {
  fearEvidence,
  fearSource,
  historyHours,
  marketKeys,
  type FearEvent,
  type FearRow,
  type FearSport,
} from "./vegas-fear";

const fields =
  "id,game_id,kind,provider,source,observed_at,recorded_at,payload";
const pageSize = 250;
const maxPages = 6;
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

// Receipt time fixes the window at the start of this fetch. A strict keyset
// handles batch timestamp ties without shifting earlier pages as rows arrive.
async function quoteHistory(
  client: typeof supabase,
  table: "source_observations" | "nba_observations",
  event: FearEvent,
  now: number,
  signal?: AbortSignal,
) {
  const rows: FearRow[] = [];
  const seen = new Set<string>();
  let cursor: FearRow | undefined;
  for (let page = 0; page < maxPages; page++) {
    signal?.throwIfAborted();
    let query = client
      .from(table)
      .select(fields)
      .eq("game_id", event.id)
      .in("kind", event.sport === "nfl" ? ["odds"] : ["odds", "prop"])
      .in("payload->>market", marketKeys(event.sport))
      .gte(
        "recorded_at",
        new Date(now - (historyHours * day) / 24).toISOString(),
      )
      .lte("recorded_at", new Date(now).toISOString())
      .order("recorded_at", { ascending: false })
      .order("id")
      .limit(pageSize + 1);
    if (cursor) {
      // The cursor uses the original Postgres timestamp string to retain microseconds.
      if (
        !/^[\dT :.+Z-]+$/.test(cursor.recorded_at) ||
        !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(cursor.id)
      )
        return { rows, error: true, truncated: false };
      query = query.or(
        `recorded_at.lt."${cursor.recorded_at}",and(recorded_at.eq."${cursor.recorded_at}",id.gt.${cursor.id})`,
      );
    }
    try {
      const result = await (signal ? query.abortSignal(signal) : query);
      signal?.throwIfAborted();
      if (result.error) return { rows, error: true, truncated: false };
      const batch = (result.data || []) as FearRow[];
      const kept = batch.slice(0, pageSize);
      for (const row of kept) {
        if (row.game_id === event.id && !seen.has(row.id)) {
          seen.add(row.id);
          rows.push(row);
        }
      }
      if (batch.length <= pageSize)
        return { rows, error: false, truncated: false };
      const next = kept.at(-1);
      if (!next || next.id === cursor?.id)
        return { rows, error: true, truncated: false };
      cursor = next;
    } catch (error) {
      if (signal?.aborted) throw error;
      return { rows, error: true, truncated: false };
    }
  }
  return { rows, error: false, truncated: true };
}

export async function fearDetail(
  event: FearEvent,
  now: number,
  client = supabase,
  signal?: AbortSignal,
) {
  const table =
    event.sport === "nfl" ? "source_observations" : "nba_observations";
  const contextQuery = client
    .from(table)
    .select(fields)
    .eq("game_id", event.id)
    .eq("kind", "injury")
    .order("observed_at", { ascending: false, nullsFirst: false })
    .order("id")
    .limit(contextCap + 1);
  const [market, context] = await Promise.all([
    quoteHistory(client, table, event, now, signal),
    signal ? contextQuery.abortSignal(signal) : contextQuery,
  ]);
  signal?.throwIfAborted();
  const rows = market.rows;
  const observedTimes = rows
    .map((row) => Date.parse(row.observed_at || ""))
    .filter(
      (time) =>
        time >= now - (historyHours * day) / 24 &&
        time <= now &&
        time < Date.parse(event.start),
    );
  const marketCoverage = {
    rows: rows.length,
    books: new Set(rows.map((row) => row.payload?.book).filter(Boolean)).size,
    markets: new Set(rows.map((row) => row.payload?.market).filter(Boolean))
      .size,
    earliest: observedTimes.length ? Math.min(...observedTimes) : null,
    latest: observedTimes.length ? Math.max(...observedTimes) : null,
  };
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
    evidence: fearEvidence(event, rows, now),
    marketCoverage,
    marketError: !!market.error,
    contextError: !!context.error,
    marketTruncated: market.truncated,
    contextTruncated: contextRows.length > contextCap,
    reports,
    fetchedAt: now,
  };
}

export function supportedFearSport(sport: FearSport): sport is "nfl" | "nba" {
  return sport === "nfl" || sport === "nba";
}
