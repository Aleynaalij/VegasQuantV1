import { createClient } from "@supabase/supabase-js";
import {
  allowedMarkets,
  dates,
  gameForEvent,
  normalizeMarkets,
  oddsKeys,
  paths,
  scoreboardGames,
  scoreboardUrl,
  sha256,
  summaryUrl,
} from "./normalize.ts";
import type { NewSport, SportGame } from "../../../src/lib/sport-contract.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await db.rpc(name, args);
  if (r.error) throw Error(r.error.message);
  return r.data;
}
async function read(url: string) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      "User-Agent": "VegasQuant/1.0 (sports research; vegasquant.app)",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw Error(`Source HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > 10000000) throw Error("Source too large");
  const clean = new URL(url);
  clean.searchParams.delete("apiKey");
  return {
    data: JSON.parse(body),
    source: {
      url: clean.toString(),
      sha256: await sha256(body),
      retrieved_at: new Date().toISOString(),
      body,
    },
    remaining: res.headers.has("x-requests-remaining")
      ? Number(res.headers.get("x-requests-remaining"))
      : null,
  };
}
Deno.serve(async (req: Request) => {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (
    !token ||
    (await rpc("feed_authorize", { p_digest: await sha256(token) })) !== true
  )
    return new Response("Unauthorized", { status: 401 });
  const result: Record<string, unknown> = {};
  for (const sport of ["nhl", "ncaab"] as NewSport[]) {
    const errors: string[] = [];
    const now = Date.now();
    let inserted = 0,
      settings: any;
    if ((await rpc("sports_refresh_lease", { p_sport: sport })) !== true) {
      result[sport] = { status: "IN_PROGRESS" };
      continue;
    }
    try {
      settings = await rpc("sports_feed_settings", { p_sport: sport });
      if (!settings) throw Error("Sport settings missing");
      if (
        !settings.last_schedule_at ||
        now - Date.parse(settings.last_schedule_at) >= 15 * 60000
      ) {
        const ds = dates(now);
        for (let i = 0; i < ds.length; i += 3) {
          const batches = await Promise.allSettled(
            ds.slice(i, i + 3).map(async (day) => {
              const r = await read(scoreboardUrl(sport, day));
              const games = scoreboardGames(r.data, sport, r.source);
              await rpc("ingest_sports", {
                p: {
                  sport,
                  source: r.source,
                  games,
                  details: { day, games: games.length },
                },
              });
              return games.length;
            }),
          );
          for (const b of batches) {
            if (b.status === "fulfilled") inserted += b.value;
            else errors.push("schedule: " + String(b.reason).slice(0, 100));
          }
        }
        if (!errors.length)
          await rpc("sports_feed_checkpoint", {
            p_sport: sport,
            p: { last_schedule_at: new Date(now).toISOString() },
          });
      }
      const rows = await db
        .from("sports_games")
        .select("id,payload")
        .eq("sport", sport)
        .gt("start_time", new Date(now).toISOString())
        .lt("start_time", new Date(now + 7 * 86400000).toISOString())
        .order("start_time");
      if (rows.error) throw rows.error;
      const games: SportGame[] = (rows.data || []).map((g: any) => ({
        ...g.payload,
        id: g.id,
      }));
      // Free matchup summaries carry provider-described injuries/rosters; no clearance inferred from absence.
      {
        const recent = await db
          .from("sports_facts")
          .select("game_id,payload")
          .eq("kind", "team_context")
          .gte("recorded_at", new Date(now - 6 * 3600000).toISOString());
        if (recent.error) throw recent.error;
        const coveredTeams = new Map<string, Set<string>>();
        for (const f of recent.data || []) {
          if (f.payload?.team_id) {
            const ids = coveredTeams.get(f.game_id) || new Set<string>();
            ids.add(f.payload.team_id);
            coveredTeams.set(f.game_id, ids);
          }
        }
        const covered = new Set(
          [...coveredTeams.entries()]
            .filter(([, ids]) => ids.size >= 2)
            .map(([id]) => id),
        );
        for (const g of games
          .filter((g) => !covered.has(g.id))
          .filter((g) => Date.parse(g.start_time) <= now + 36 * 3600000)
          .slice(0, 4)) {
          try {
            const r = await read(summaryUrl(sport, g.provider_id));
            const payload = {
              injuries: r.data.injuries || null,
              rosters: r.data.rosters || null,
              predictor: null,
              team_statistics: r.data.boxscore?.teams || null,
              last_five: r.data.lastFiveGames || null,
              availability:
                "Provider-reported only; omissions do not confirm availability",
              goalie_confirmation:
                sport === "nhl"
                  ? "Unknown unless explicitly reported in source"
                  : null,
            };
            await rpc("ingest_sports", {
              p: {
                sport,
                source: r.source,
                facts: [{ game_id: g.id, kind: "team_context", payload }],
                details: { context_game: g.provider_id },
              },
            });
            // Roster and team season statistics are factual context, never an inferred starting lineup.
            await Promise.all(
              [g.away, g.home].flatMap((team) =>
                ["roster", "statistics"].map(async (endpoint) => {
                  try {
                    let statsSeason = g.season;
                    const get = () =>
                      read(
                        `https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/teams/${team.provider_id}/${endpoint}?season=${statsSeason}`,
                      );
                    let t;
                    try {
                      t = await get();
                    } catch (e) {
                      if (
                        endpoint !== "statistics" ||
                        sport !== "ncaab" ||
                        !String(e).includes("404")
                      )
                        throw e;
                      statsSeason = g.season - 1;
                      t = await get();
                    }
                    await rpc("ingest_sports", {
                      p: {
                        sport,
                        source: t.source,
                        facts: [
                          {
                            game_id: g.id,
                            kind:
                              endpoint === "roster" ? "roster" : "team_context",
                            payload: {
                              team_id: team.id,
                              season: statsSeason,
                              prior_season: statsSeason !== g.season,
                              scope:
                                statsSeason !== g.season
                                  ? "PRIOR SEASON provider statistics; not current-season form or a roster projection"
                                  : "Provider season context; not a confirmed lineup or opponent-adjusted forecast",
                              data: t.data,
                            },
                          },
                        ],
                      },
                    });
                  } catch (e) {
                    errors.push(`${endpoint}: ${String(e).slice(0, 80)}`);
                  }
                }),
              ),
            );
          } catch (e) {
            errors.push("context: " + String(e).slice(0, 100));
          }
        }
        if (!errors.length)
          await rpc("sports_feed_checkpoint", {
            p_sport: sport,
            p: { last_context_at: new Date(now).toISOString() },
          });
      }
      const key = Deno.env.get("ODDS_API_KEY");
      const budget =
        settings.credits_remaining === null ||
        settings.credits_remaining > 1000;
      if (!key || !budget) {
        await rpc("sports_refresh_lease", { p_sport: sport, p_release: true });
        result[sport] = {
          games: games.length,
          status: !key ? "ODDS_NOT_CONFIGURED" : "CREDIT_RESERVE",
          errors,
        };
        continue;
      }
      const near = games.some(
        (g) => Date.parse(g.start_time) <= now + 6 * 3600000,
      );
      if (
        settings.lines_enabled &&
        games.length &&
        (!settings.last_lines_at ||
          now - Date.parse(settings.last_lines_at) >=
            (near ? 25 * 60000 : 3 * 3600000))
      ) {
        const mk = sport === "nhl" ? "h2h,totals" : "h2h,spreads";
        if (
          (await rpc("sports_reserve_credits", {
            p_sport: sport,
            p_cost: 2,
          })) !== true
        )
          throw Error("Daily credit cap or reserve reached");
        const r = await read(
          `https://api.the-odds-api.com/v4/sports/${oddsKeys[sport]}/odds?apiKey=${encodeURIComponent(key)}&bookmakers=fanduel&markets=${mk}&oddsFormat=american`,
        );
        const markets = normalizeMarkets(
          r.data,
          sport,
          games,
          r.source,
          Date.now(),
        );
        await rpc("ingest_sports", {
          p: {
            sport,
            source: r.source,
            markets,
            details: {
              quote_count: markets.length,
              credits_remaining: r.remaining,
            },
          },
        });
        await rpc("sports_feed_checkpoint", {
          p_sport: sport,
          p: {
            last_lines_at: new Date(now).toISOString(),
            credits_remaining: r.remaining,
          },
        });
      }
      if (
        sport === "nhl" &&
        games.length > 0 &&
        settings.props_enabled &&
        budget
      ) {
        const cache = { ...settings.prop_fetched };
        const list = await read(
          `https://api.the-odds-api.com/v4/sports/${oddsKeys[sport]}/events?apiKey=${encodeURIComponent(key)}`,
        );
        let checked = 0;
        for (const e of Array.isArray(list.data) ? list.data : []) {
          const start = Date.parse(e.commence_time);
          if (
            !gameForEvent(e, games) ||
            !(start > now && start < now + 6 * 3600000) ||
            !/^[a-zA-Z0-9_-]+$/.test(e.id) ||
            now - Date.parse(cache[e.id] || "1970-01-01") <
              (start - now <= 2 * 3600000 ? 25 * 60000 : 2 * 3600000)
          )
            continue;
          if (checked++ >= settings.max_prop_events) break;
          try {
            const markets = (allowedMarkets.nhl as readonly string[])
              .filter((x) => x.startsWith("player_"))
              .join(",");
            if (
              (await rpc("sports_reserve_credits", {
                p_sport: sport,
                p_cost: 3,
              })) !== true
            ) {
              errors.push("Daily prop credit cap or reserve reached");
              break;
            }
            const r = await read(
              `https://api.the-odds-api.com/v4/sports/${oddsKeys[sport]}/events/${e.id}/odds?apiKey=${encodeURIComponent(key)}&bookmakers=fanduel&markets=${markets}&oddsFormat=american`,
            );
            await rpc("ingest_sports", {
              p: {
                sport,
                source: r.source,
                markets: normalizeMarkets(
                  r.data,
                  sport,
                  games,
                  r.source,
                  Date.now(),
                ),
                details: { prop_event: e.id, credits_remaining: r.remaining },
              },
            });
            cache[e.id] = new Date(now).toISOString();
            await rpc("sports_feed_checkpoint", {
              p_sport: sport,
              p: { prop_fetched: cache, credits_remaining: r.remaining },
            });
            if (r.remaining !== null && r.remaining <= 1000) break;
          } catch (e) {
            errors.push("props: " + String(e).slice(0, 100));
          }
        }
      }
      result[sport] = { scheduled: inserted, games: games.length, errors };
    } catch (e) {
      errors.push(String(e).slice(0, 150));
      result[sport] = { status: "ERROR", errors };
    }
    await rpc("sports_refresh_lease", { p_sport: sport, p_release: true });
    if (errors.length)
      await db.from("feed_runs").insert({
        provider: `sports-sync:${sport}`,
        status: "partial",
        details: { errors },
      });
  }
  return Response.json(result);
});
