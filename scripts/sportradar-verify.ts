// Explicit one-off server-side check. Not part of npm build, CI or a polling schedule.
// Uses the deployment's private environment; outputs sanitized evidence metadata only.
import { fetchSportradarCurrentWeek, fetchSportradarGame, sportradarConfig, sportradarStatus, SportradarError } from "../src/lib/sportradar-nfl";
const emit = (data: object) => console.log("SPORTRADAR_CHECK " + JSON.stringify(data));
const code = (e: unknown) => e instanceof SportradarError ? e.code : "verification_failed";
async function main() {
  const config = sportradarConfig();
  const status = sportradarStatus(config);
  if (status.blockers.length) { emit(status); return; }
  const schedule = await fetchSportradarCurrentWeek(config);
  const week = schedule.payload.week as { games?: unknown[] } | undefined;
  if (!week || !Array.isArray(week.games)) throw new SportradarError("schedule_schema_unverified");
  type Game = { id: string; status: string; scheduled: string; home?: { alias?: string }; away?: { alias?: string } };
  const games = week.games.filter((g): g is Game => !!g && typeof g === "object" && typeof (g as Game).id === "string" && typeof (g as Game).scheduled === "string" && Number.isFinite(Date.parse((g as Game).scheduled)));
  const sorted = [...games].sort((a,b) => Date.parse(a.scheduled) - Date.parse(b.scheduled));
  const game = sorted.find(g => g.status === "inprogress") || sorted.find(g => Date.parse(g.scheduled) >= Date.now()) || sorted.at(-1);
  emit({ status: "schedule_received", access: config.access, games: games.length, source_url: schedule.source_url, sha256: schedule.sha256, retrieved_at: schedule.retrieved_at, provider_last_modified: schedule.provider_last_modified });
  if (!game) throw new SportradarError("schedule_has_no_games");
  for (const feed of ["statistics", "pbp"] as const) {
    try {
      const r = await fetchSportradarGame(config, game.id, feed);
      emit({ status: "response_received", feed, game_id: game.id, matchup: `${game.away?.alias || "unknown"}@${game.home?.alias || "unknown"}`, scheduled: game.scheduled, game_status: r.payload.status, quarter: r.payload.quarter ?? null, clock: r.payload.clock ?? null, source_url: r.source_url, sha256: r.sha256, retrieved_at: r.retrieved_at, provider_last_modified: r.provider_last_modified, live_freshness_verified: false });
    } catch (e) { emit({ status: "blocked", feed, game_id: game.id, error: code(e) }); }
  }
}
void main().catch(e => emit({ status: "blocked", error: code(e) }));
