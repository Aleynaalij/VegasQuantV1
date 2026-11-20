// Prop Finder free teaser: every 20 minutes (GitHub Action nba-prop-teaser.yml) compute tonight's
// board with the exact member pipeline (loadSlate + buildPropRows), keep only the top 2 fresh
// edges and the board count, and store that one row in public.nba_prop_teaser. The full board is
// never stored or printed. The repository is public, so this prints counts only.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/nba-teaser/run.ts [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { loadSlate } from "../../src/lib/nba-tonight";
import { buildPropRows } from "../../src/lib/nba-props";
import { buildTeaser } from "../../src/lib/nba-teaser";

async function main() {
  const url = process.env.SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured; nothing to do.",
    );
    return;
  }
  const dry = process.argv.includes("--dry-run");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const slate = await loadSlate(true, undefined, db as never);
  const now = Date.now();
  const teaser = buildTeaser(buildPropRows(slate, now), now);
  console.log(
    `teaser: ${slate.games.length} games, ${teaser.total} props on the board, ${teaser.rows.length} in the free slice${dry ? " (dry run, not stored)" : ""}`,
  );
  if (dry) return;
  const r = await db.from("nba_prop_teaser").upsert({
    id: 1,
    computed_at: teaser.computedAt,
    total: teaser.total,
    rows: teaser.rows,
  });
  if (r.error)
    throw new Error(`teaser write failed: ${r.error.code || "unknown"}`);
}

main().catch((e) => {
  // Message only: a stack or payload could carry board data into the public log.
  console.error(e instanceof Error ? e.message : "teaser job failed");
  process.exit(1);
});
