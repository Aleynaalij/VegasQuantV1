// Publishes the research board: every three hours (GitHub Action research-board.yml) the strongest
// rule-passing player-prop legs on the week's NFL slate go into the legs feed as labeled research.
// The repository is public, so it prints counts only: no players, prices or keys.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/research-board/run.ts [--dry-run]
//     [--limit=N] [--per-game=N]   (manual runs only: raise the board caps, at most 60 and 12)
import { createClient } from "@supabase/supabase-js";
import { csvRows } from "../../supabase/functions/result-sync/grade.ts";
import type { Observation } from "../../supabase/functions/result-sync/prices.ts";
import { BOARD_MARKETS, candidate, gameLegs, pickBoard, selectionKey, type BoardGame } from "./select.ts";

const HORIZON = 7 * 86400000;
/** The validator accepts quotes up to eight hours old; stay inside it. */
const FRESH = 7 * 3600000;
const NFLVERSE = (season: number) =>
  `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`;

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured; nothing to do.");
    return;
  }
  const dry = process.argv.includes("--dry-run");
  // A release holds at most 12 candidates; the per-run cap keeps one run from flooding the feed.
  const arg = (name: string, fallback: number, max: number) => {
    const v = Number(process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1]);
    return Number.isInteger(v) && v > 0 ? Math.min(v, max) : fallback;
  };
  const limit = arg("limit", 8, 60), perGame = arg("per-game", 3, 12);
  const db = createClient(url, key, { auth: { persistSession: false } });
  const now = Date.now();
  const games = await db
    .from("games")
    .select("id,provider_id,away_team,home_team,away_abbreviation,home_abbreviation,kickoff,season,week,sport")
    .ilike("sport", "nfl")
    .eq("kickoff_tbd", false)
    .gt("kickoff", new Date(now + 30 * 60000).toISOString())
    .lte("kickoff", new Date(now + HORIZON).toISOString())
    .order("kickoff");
  if (games.error) throw Error("Game query failed");
  const slate = (games.data || []) as BoardGame[];
  if (!slate.length) return report({ games: 0 });

  const markets = Object.keys(BOARD_MARKETS).flatMap((m) => [m, `${m}_alternate`]);
  const observations: Observation[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from("source_observations")
      .select("game_id,observed_at,payload")
      .eq("kind", "odds")
      .in("game_id", slate.map((g) => g.id))
      .in("payload->>market", markets)
      .gte("observed_at", new Date(now - FRESH).toISOString())
      .order("id")
      .range(from, from + 999);
    if (page.error) throw Error("Observation query failed");
    observations.push(...((page.data || []) as Observation[]));
    if ((page.data || []).length < 1000) break;
  }

  // Recent form needs the current season and the one before it.
  const seasons = [...new Set(slate.flatMap((g) => [g.season, g.season - 1]))];
  const rows: Record<string, string>[] = [];
  for (const s of seasons) {
    const r = await fetch(NFLVERSE(s));
    if (r.status === 404) continue; // a season not yet released
    if (!r.ok) throw Error("nflverse download failed");
    rows.push(...csvRows(await r.text()));
  }

  const published = await db
    .from("published_legs")
    .select("game_id,name,market")
    .in("game_id", slate.map((g) => g.id));
  if (published.error) throw Error("Published leg query failed");
  const seen = new Set(
    (published.data || []).filter((l) => l.game_id && l.name && l.market).map((l) => selectionKey(l.game_id, l.name, l.market)),
  );

  const legs = slate.flatMap((g) => gameLegs(g, observations, rows, now));
  const board = pickBoard(legs, seen, limit, perGame);
  // Research boards bind each leg to its own game explicitly; the stage only satisfies the release's
  // foreign key. Use the latest release's stage, or any challenge stage before the first release.
  const latest = await db.from("candidate_releases").select("stage_id").order("created_at", { ascending: false }).limit(1);
  let stageId: string | undefined = latest.data?.[0]?.stage_id;
  if (!stageId) {
    const any = await db.from("challenge_stages").select("id").order("stage_number").limit(1);
    stageId = any.data?.[0]?.id;
  }
  if (!stageId) throw Error("No challenge stage to publish under");

  let published_releases = 0, published_legs = 0, blocked = 0, failed = 0, attempted = 0;
  const hour = new Date(now).toISOString().slice(0, 13).replace(/[-T:]/g, "");
  for (const g of slate) {
    const mine = board.filter((l) => l.game.id === g.id);
    if (!mine.length) continue;
    if (dry) {
      published_releases++;
      published_legs += mine.length;
      continue;
    }
    attempted++;
    const r = await db.from("candidate_releases").insert({
      stage_id: stageId,
      title: `Research board · ${g.away_abbreviation} @ ${g.home_abbreviation}`,
      candidates: mine.map(candidate),
      expires_at: g.kickoff,
      publication_key: `research-board-${g.id}-${hour}`,
    });
    // A validator rejection (23514, e.g. a quote that moved since the read) or a rerun within the
    // same hour (23505) is expected; anything else is an operational failure.
    if (r.error) {
      if (r.error.code === "23514" || r.error.code === "23505") blocked++;
      else failed++;
    } else {
      published_releases++;
      published_legs += mine.length;
    }
  }
  report({ games: slate.length, quotes: observations.length, qualifying: legs.length, published_releases, published_legs, blocked, failed, dry_run: dry });
  // Fail the run, so the workflow turns red, on any operational error or when nothing it tried publishes.
  if (failed || (attempted && !published_releases)) process.exit(1);
}

function report(counts: Record<string, number | boolean>) {
  console.log(JSON.stringify(counts));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Research board failed");
  process.exit(1);
});
