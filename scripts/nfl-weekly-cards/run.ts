/**
 * Stage the Sunday NFL research cards (WR matchups + defense vs position) for the Zone. The database
 * publishes them from 7:00 AM ET (private.nfl_weekly_cards_post). The repo is public: prints counts only.
 *   npx tsx scripts/nfl-weekly-cards/run.ts [--day=YYYY-MM-DD] [--dry-run]
 */
import { createClient } from "@supabase/supabase-js";
import {
  buildWeeklyCards,
  dvpCardText,
  parseCsv,
  wrCardText,
  type CardGame,
} from "../../src/lib/nfl-weekly-cards";
import { cardDate } from "../../src/lib/nba-threes-card";

const etDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

async function main() {
  const dry = process.argv.includes("--dry-run");
  const day =
    process.argv.find((a) => a.startsWith("--day="))?.split("=")[1] ||
    etDay(new Date());
  if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 0) {
    console.log(`${day} is not a Sunday; nothing to do.`);
    return;
  }
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured; nothing to do.",
    );
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  // Sunday 00:00 ET through Tuesday 06:00 ET (Monday night), with generous UTC bounds filtered by ET day.
  const start = new Date(`${day}T00:00:00Z`).getTime();
  const g = await db
    .from("games")
    .select("away_team,home_team,kickoff")
    .gte("kickoff", new Date(start).toISOString())
    .lt("kickoff", new Date(start + 3 * 86400000).toISOString())
    .order("kickoff");
  if (g.error) throw new Error(`games: ${g.error.message}`);
  const monday = etDay(new Date(start + 36 * 3600000));
  const games: CardGame[] = (g.data || [])
    .filter((x) => [day, monday].includes(etDay(new Date(x.kickoff))))
    .map((x) => ({ away: x.away_team, home: x.home_team, kickoff: x.kickoff }));
  if (!games.length) {
    console.log(`No Sunday or Monday games for ${day}; nothing staged.`);
    return;
  }
  const d = new Date(`${day}T12:00:00Z`);
  const season =
    d.getUTCMonth() >= 2 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const res = await fetch(
    `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_${season}.csv`,
  );
  if (!res.ok) throw new Error(`nflverse ${season}: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  const cards = buildWeeklyCards(day, rows, games);
  if (cards.wr.length === 0 || cards.dvp.length === 0)
    throw new Error("Not enough season data to build the cards");
  const label = cardDate(day).replace(" · ", " ");
  const staged = [
    ...cards.wr.map((c) => ({
      kind: "wr",
      page: c.page,
      title: `WR matchups ${c.page} of ${c.pages} · ${label}`,
      body: wrCardText(c),
      payload: c,
    })),
    ...cards.dvp.map((c) => ({
      kind: "dvp",
      page: c.page,
      title: `Defense vs position ${c.page} of ${c.pages} · ${label}`,
      body: dvpCardText(c),
      payload: c,
    })),
  ];
  console.log(
    `${day}: ${games.length} games, ${cards.wr.length} WR cards (${cards.wr.reduce((s, c) => s + c.rows.length, 0)} receivers), ${cards.dvp.length} defense cards; season through week ${cards.dvp[0].throughWeek}.`,
  );
  if (dry) return console.log("Dry run: nothing staged.");
  const r = await db.rpc("nfl_weekly_cards_stage", {
    p_day: day,
    p_cards: staged,
  });
  if (r.error) throw new Error(`stage: ${r.error.message}`);
  console.log(`Stage result: ${JSON.stringify(r.data)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
