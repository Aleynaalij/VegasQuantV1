import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import {
  contractFor,
  espnStat,
  csvRows,
  weeklyStat,
  compare,
  type Game,
  type Contract,
} from "./grade.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
async function get(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(18000),
    headers: {
      "User-Agent":
        "VegasQuant/1.0 (editorial result tracking; vegasquant.app)",
    },
  });
  if (!r.ok) throw Error(`Source HTTP ${r.status}`);
  const text = await r.text();
  if (!text) throw Error("Empty source");
  return {
    text,
    hash: await hash(text),
    retrieved_at: new Date().toISOString(),
    last_modified: r.headers.get("last-modified"),
  };
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return new Response("Unauthorized", { status: 401 });
  const auth = await db.rpc("feed_authorize", { p_digest: await hash(token) });
  if (auth.error || auth.data !== true)
    return new Response("Unauthorized", { status: 401 });
  const started = Date.now();
  const blockers: { leg_key: string; reason: string }[] = [];
  let settled = 0,
    checked = 0,
    live = 0;
  try {
    const [releases, games] = await Promise.all([
      db
        .from("candidate_releases")
        .select("id,candidates,created_at,expires_at,stage_id")
        .gte("expires_at", new Date(Date.now() - 21 * 86400000).toISOString())
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("games")
        .select(
          "id,provider_id,away_team,home_team,away_abbreviation,home_abbreviation,kickoff,season,week",
        )
        .gte("kickoff", new Date(Date.now() - 21 * 86400000).toISOString())
        .lte("kickoff", new Date(Date.now() + 8 * 86400000).toISOString()),
    ]);
    if (releases.error || games.error)
      throw Error("Publication/game query failed");
    const contracts: Contract[] = [];
    for (const r of releases.data || [])
      for (const [i, c] of r.candidates.entries()) {
        const key = `candidate:${r.id}:${i + 1}`;
        const parsed = contractFor(
          c,
          key,
          games.data as Game[],
          r.created_at,
          r.expires_at,
        );
        if (typeof parsed === "string") {
          blockers.push({ leg_key: key, reason: parsed });
          continue;
        }
        contracts.push(parsed);
      }
    if (contracts.length) {
      const saved = await db.rpc("register_result_contracts", { p: contracts });
      if (saved.error) throw Error("Contract registration failed");
    }
    const progressRows = await db
      .from("leg_result_progress")
      .select("leg_key,status,checked_at");
    if (progressRows.error) throw Error("Progress query failed");
    const prior = new Map((progressRows.data || []).map((p) => [p.leg_key, p]));
    contracts.sort(
      (a, b) =>
        Date.parse(prior.get(a.leg_key)?.checked_at || "1970-01-01") -
        Date.parse(prior.get(b.leg_key)?.checked_at || "1970-01-01"),
    );
    const weekly = new Map<number, Promise<any>>(),
      summaries = new Map<string, Promise<any>>();
    for (const c of contracts) {
      const g = (games.data as Game[]).find((g) => g.id === c.game_id)!;
      if (Date.parse(g.kickoff) > Date.now()) continue;
      if (
        prior.get(c.leg_key)?.status === "FINAL" &&
        Date.now() - Date.parse(prior.get(c.leg_key)!.checked_at) < 3600000
      )
        continue;
      if (
        Date.now() - started > 80000 ||
        (summaries.size >= 6 && !summaries.has(g.provider_id))
      ) {
        blockers.push({
          leg_key: c.leg_key,
          reason: "Deferred to next poll within source budget",
        });
        continue;
      }
      checked++;
      const source = `https://www.espn.com/nfl/boxscore/_/gameId/${g.provider_id}`;
      let status = "BLOCKED",
        reason = "Source unavailable",
        value: number | null = null;
      try {
        if (!summaries.has(g.provider_id))
          summaries.set(
            g.provider_id,
            get(
              `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${g.provider_id}`,
            ),
          );
        const snapshot = await summaries.get(g.provider_id)!;
        const stat = espnStat(JSON.parse(snapshot.text), g, c);
        if (typeof stat === "string") throw Error(stat);
        value = stat.value;
        if (!stat.final) {
          status =
            compare(value, c) === "WIN" ? "TARGET_REACHED_LIVE" : "TRACKING";
          reason = "Live stat only; reversible until final verification";
          if (status === "TARGET_REACHED_LIVE") live++;
        } else {
          const weeklyUrl = `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${g.season}.csv`;
          if (!weekly.has(g.season))
            weekly.set(
              g.season,
              get(weeklyUrl).then((s) => ({ ...s, rows: csvRows(s.text) })),
            );
          let second: any;
          try {
            second = await weekly.get(g.season)!;
          } catch {
            status = "AWAITING_CORROBORATION";
            throw Error(
              "nflverse unavailable; final result awaiting corroboration",
            );
          }
          const corroboration = weeklyStat(second.rows, g, c);
          if (typeof corroboration === "string") {
            status = "AWAITING_CORROBORATION";
            reason = corroboration;
          } else if (corroboration.value !== value) {
            status = "CONFLICT";
            reason = "ESPN and nflverse disagree; no automatic result";
          } else {
            const outcome = await db.rpc("finalize_editorial_leg", {
              p_key: c.leg_key,
              p_espn: {
                value,
                event_id: g.provider_id,
                completed: true,
                athlete_id: stat.athlete_id,
                hash: snapshot.hash,
                retrieved_at: snapshot.retrieved_at,
                source_url: source,
              },
              p_nflverse: {
                value: corroboration.value,
                game_id: corroboration.game_id,
                player_id: corroboration.player_id,
                hash: second.hash,
                retrieved_at: second.retrieved_at,
                last_modified: second.last_modified,
                source_url: weeklyUrl,
              },
            });
            if (outcome.error) throw Error("Final result transaction failed");
            if (outcome.data.inserted) settled++;
            status = outcome.data.conflict ? "CONFLICT" : "FINAL";
            reason = outcome.data.conflict
              ? "Provider correction differs from immutable result; review required"
              : "Final ESPN stat corroborated by nflverse";
          }
        }
      } catch (e) {
        reason = e instanceof Error ? e.message : "Result source failed";
      }
      if (
        status !== "FINAL" &&
        status !== "TRACKING" &&
        status !== "TARGET_REACHED_LIVE"
      )
        blockers.push({ leg_key: c.leg_key, reason });
      const progress = await db
        .from("leg_result_progress")
        .upsert({
          leg_key: c.leg_key,
          status,
          value,
          reason,
          source_url: source,
          checked_at: new Date().toISOString(),
        });
      if (progress.error) throw Error("Progress persistence failed");
    }
    const run = await db
      .from("feed_runs")
      .insert({
        provider: "Editorial result sync",
        status: blockers.length ? "partial" : "ok",
        details: {
          checked,
          settled,
          live,
          contracts: contracts.length,
          blockers,
          scope:
            "NFL full-game single-player yards/receptions; no sportsbook payout or official bankroll mutation",
        },
      });
    if (run.error) throw Error("Run journal failed");
    return Response.json({ checked, settled, live, blockers: blockers.length });
  } catch {
    await db
      .from("feed_runs")
      .insert({
        provider: "Editorial result sync",
        status: "error",
        details: {
          message: "Result sync failed; existing immutable results retained",
          checked,
          settled,
        },
      });
    return Response.json({ error: "Result sync failed" }, { status: 502 });
  }
});
