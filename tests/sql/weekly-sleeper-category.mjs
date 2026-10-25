import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const migration = (name) =>
  fs.readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth;
create function auth.role() returns text language sql as $$select 'service_role'::text$$;
create function private.is_admin() returns boolean language sql as $$select false$$;
create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table games(id uuid primary key,sport text,kickoff timestamptz,kickoff_tbd boolean,home_abbreviation text,away_abbreviation text);
create table source_observations(id uuid primary key default gen_random_uuid(),game_id uuid,kind text,observed_at timestamptz,recorded_at timestamptz,payload jsonb,source text default 'https://example.com/quote');
create table challenge_stages(id uuid primary key,game_id uuid);
create table analysis_versions(id uuid primary key,sections jsonb);
create table candidate_releases(id uuid primary key default gen_random_uuid(),stage_id uuid,title text default 't',candidates jsonb,expires_at timestamptz,publication_key text default gen_random_uuid()::text);
create table official_picks(id uuid primary key default gen_random_uuid(),game_id uuid,analysis_id uuid,selection text,book text,odds numeric,market text,recommended_line numeric,direction text,model_probability numeric);
create table edge_releases(id uuid primary key default gen_random_uuid(),official_pick_id uuid,items jsonb);
create table research_leg_results(leg_key text primary key);
create table research_feed_posts(id uuid primary key default gen_random_uuid(),game_id uuid,category text,result_leg_key text);
create view published_legs as select 'candidate:'||r.id::text||':'||c.ordinality::text as leg_key, r.id as release_id, null::uuid as official_pick_id,
 (c.value->>'game_id')::uuid as game_id,
 case when (c.value->>'parlay')='true' then 'PARLAY' when (c.value->>'fun_play')='true' then 'HAIL_MARY' else 'SINGLE' end as kind,
 c.value->>'name' as name, c.value->>'market' as market, now() as published_at
 from candidate_releases r cross join lateral jsonb_array_elements(r.candidates) with ordinality c(value,ordinality);`);
await db.exec(migration("20261016130632_nfl_selection_gate.sql"));
await db.exec(migration("20261017000000_research_board_tier.sql"));

await db.exec(`alter table public.games add column season integer;alter table public.games add column week integer;
alter table public.candidate_releases add constraint candidate_releases_candidates_check check(jsonb_typeof(candidates)='array' and jsonb_array_length(candidates) between 1 and 12);
alter table public.candidate_releases add constraint release_key_unique unique(publication_key);`);
await db.exec(migration("20261025121434_weekly_sleeper_category.sql"));
const release = "00000000-0000-4000-8000-000000000090";
const now = new Date();
const cutoff = now.toISOString();
const kick = new Date(now.getTime() + 86400000).toISOString();
const leaves = [];
for (let i = 0; i < 12; i++) {
  const game = `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;
  const obs = `00000000-0000-4000-8000-${String(i + 101).padStart(12, "0")}`;
  await db.query(
    "insert into games values($1,'nfl',$2,false,'AAA','BBB',2026,7)",
    [game, kick],
  );
  await db.query(
    "insert into source_observations(id,game_id,kind,recorded_at,payload) values($1,$2,'news',$3,$4::jsonb)",
    [
      obs,
      game,
      cutoff,
      JSON.stringify({
        source_files: [
          {
            url: "https://example.com/primary",
            sha256: "a".repeat(64),
            retrieved_at: cutoff,
          },
        ],
      }),
    ],
  );
  leaves.push({
    analysis_kind: "ENTERTAINMENT_SLEEPER",
    name: `Fixture ${i}`,
    market: "Full game · 40+ receiving yards",
    copy_text: `Fixture ${i} 40+ receiving yards`,
    game_id: game,
    parlay_group: release,
    pick_of_day: false,
    fun_play: false,
    gambly_url: "https://gambly.com/",
    why: "Five-game workload reviewed",
    risk: "Role and drive risk; active status unconfirmed",
    quote_context: "Unpriced, market availability unknown",
    historical_cutoff: cutoff,
    generated_at: cutoff,
    source_observation_ids: [obs],
    sources: [{ url: "https://example.com/primary", label: "Primary" }],
    sleeper_evidence: {
      position: "WR",
      opportunity_case: "Recent sourced target opportunity",
      failure_path: "Stalled offense",
      matchup_case: "Opponent and protection reviewed",
      availability_status: "unconfirmed",
      availability_note: "Final inactives pending; absence is not clearance",
      history_source_url: "https://example.com/primary",
      role_source_url: "https://example.com/primary",
      availability_source_url: "https://example.com/primary",
      weather_unknown: "Stadium forecast unverified",
      history_window: "latest_consecutive_games",
      history: Array.from({ length: 5 }, (_, j) => ({
        game_id: `previous-${j}`,
        value: 50,
        played_at: new Date(now.getTime() - (j + 1) * 86400000).toISOString(),
        source_url: "https://example.com/primary",
      })),
    },
  });
}
const make = () => [
  {
    analysis_kind: "ENTERTAINMENT_SLEEPER_PARLAY",
    worth_a_dollar: true,
    parlay: true,
    pick_of_day: false,
    fun_play: false,
    gambly_url: "https://gambly.com/",
    why: "Entertainment only",
    risk: "One miss loses the ticket",
    correlation_review: "Distinct games; common injury/role uncertainty",
    failure_scenarios: "Several game scripts can fail",
    sweat_until: new Date(now.getTime() + 86400000 + 14400000).toISOString(),
    leg_keys: leaves.map((_, i) => `candidate:${release}:${i + 2}`),
    parlay_legs: leaves.map((l) => ({ name: l.name, market: l.market })),
    copy_text: leaves.map((l) => l.copy_text).join("\n"),
  },
  ...structuredClone(leaves),
];
async function publish(
  c = make(),
  key = "worth-a-dollar-2026-week7-v1",
  expiry = kick,
  id = release,
) {
  return db.query(
    `insert into candidate_releases(id,title,candidates,expires_at,publication_key)values($1,'Weekly',$2::jsonb,$3,$4)`,
    [id, JSON.stringify(c), expiry, key],
  );
}
async function reject(mutate, pattern = /SLEEPER_BLOCKED/) {
  const c = make();
  mutate(c);
  await assert.rejects(publish(c), pattern);
  assert.equal(
    (await db.query("select count(*)::int n from candidate_releases")).rows[0]
      .n,
    0,
  );
}
await reject((c) => (c[1].odds = -200));
await reject((c) => (c[0].payout = 100));
await reject((c) => (c[1].model_probability = 0.8));
await reject((c) => (c[1].pick_of_day = true));
await reject((c) => (c[1].analysis_kind = "RESEARCH_BOARD"));
await reject((c) => (c[1].game_id = c[2].game_id));
await reject((c) => (c[1].sleeper_evidence.position = "TE"));
await reject((c) => (c[1].sleeper_evidence.availability_status = "OUT"));
await reject(
  (c) =>
    (c[1].sleeper_evidence.history = c[1].sleeper_evidence.history.slice(0, 4)),
);
await reject(
  (c) => (c[1].sleeper_evidence.history[0].played_at = "2099-01-01T00:00:00Z"),
);
await reject((c) => (c[1].source_observation_ids = []));
await reject((c) => (c[1].sources = []));
await reject((c) => (c[1].copy_text += " vs Sample"));
await reject((c) => (c[0].leg_keys = []));
await reject(
  (c) => (c[0].parlay_legs[0].market = "Full game · 90+ receiving yards"),
);
await reject((c) => (c[0].sweat_until = "2099-01-01T00:00:00Z"));
await reject((c) => (c[0].supersedes_release_id = release));
await assert.rejects(
  publish(make(), "worth-a-dollar-2026-week8-v1"),
  /SLEEPER_BLOCKED/,
);
await assert.rejects(
  publish(
    make(),
    "worth-a-dollar-2026-week7-v1",
    new Date(now.getTime() + 86400001).toISOString(),
  ),
  /SLEEPER_BLOCKED/,
);
await db.query(
  `update games set kickoff=now()-interval '1 minute' where id=$1`,
  [leaves[0].game_id],
);
await reject(() => {});
await db.query("update games set kickoff=$2 where id=$1", [
  leaves[0].game_id,
  kick,
]);
// The ordinary path still fails without approved priced model evidence.
await assert.rejects(
  publish([leaves[0]], "ordinary"),
  /NFL_SELECTION_GATE_BLOCKED/,
);
await publish();
assert.equal(
  (await db.query("select count(*)::int n from private.weekly_sleeper_reviews"))
    .rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select jsonb_array_length(candidates) n from candidate_releases",
    )
  ).rows[0].n,
  13,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.nfl_selection_model_approvals",
    )
  ).rows[0].n,
  0,
);
await assert.rejects(
  publish(
    make(),
    "worth-a-dollar-2026-week7-v1",
    kick,
    "00000000-0000-4000-8000-000000000091",
  ),
  /SLEEPER_BLOCKED|unique/,
);
console.log(
  "PASS weekly sleeper category: twelve leaves, provenance, expiry, mixed-category rejection and unchanged model gate",
);
await db.close();
