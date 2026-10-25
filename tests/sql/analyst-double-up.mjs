import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
process.on("uncaughtException", (e) => {
  console.error(
    e.message,
    e.detail ?? "",
    e.where ?? "",
    e.position,
    e.internalPosition,
    e.internalQuery ?? "",
    e.query?.slice(
      Math.max(0, Number(e.position) - 160),
      Number(e.position) + 160,
    ),
  );
  process.exit(1);
});
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth;
create function auth.role() returns text language sql as $$select coalesce(nullif(current_setting('app.role',true),''),'service_role')$$;
create function private.is_admin() returns boolean language sql as $$select false$$;
create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table games(id uuid primary key,sport text,kickoff timestamptz,kickoff_tbd boolean,home_abbreviation text,away_abbreviation text);
create table source_observations(id uuid primary key,game_id uuid,kind text,observed_at timestamptz,recorded_at timestamptz,payload jsonb,source text default 'https://example.com/quote');
create table challenge_stages(id uuid primary key,game_id uuid);
create table analysis_versions(id uuid primary key,sections jsonb);
create table candidate_releases(id uuid primary key default gen_random_uuid(),stage_id uuid,candidates jsonb);
create table official_picks(id uuid primary key default gen_random_uuid(),game_id uuid,analysis_id uuid,selection text,book text,odds numeric,market text,recommended_line numeric,direction text,model_probability numeric);
create table edge_releases(id uuid primary key default gen_random_uuid(),official_pick_id uuid,items jsonb);
create table research_leg_results(leg_key text primary key);
create table research_feed_posts(id uuid primary key default gen_random_uuid(),game_id uuid,category text,result_leg_key text);
create view published_legs as select null::uuid game_id,null::text name,null::text market,null::text kind,null::uuid release_id,null::uuid official_pick_id,now() published_at where false;
`);
await db.exec(
  fs.readFileSync(
    new URL(
      "../../supabase/migrations/20261016130632_nfl_selection_gate.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    new URL(
      "../../supabase/migrations/20261016132600_nfl_prospective_shadow_evidence.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.exec(
  fs
    .readFileSync(
      new URL(
        "../../supabase/migrations/20261016170000_line_shopping_books.sql",
        import.meta.url,
      ),
      "utf8",
    )
    .replace(/create table public\.leg_book_prices[\s\S]*$/, ""),
);
const game = "00000000-0000-4000-8000-000000000001",
  quote = "00000000-0000-4000-8000-000000000002";
const stamp = new Date().toISOString();
await db.query(
  `insert into games values($1,'NFL',now()+interval '1 hour',false,'DEN','SEA')`,
  [game],
);
await db.query(
  `insert into source_observations(id,game_id,kind,observed_at,recorded_at,payload) values($2,$1,'odds',now(),now(),$3::jsonb)`,
  [
    game,
    quote,
    JSON.stringify({
      book: "FanDuel",
      market: "player_reception_yds_alternate",
      provider_updated_at: stamp,
      outcomes: [
        { description: "Test Player", name: "Over", point: 39.5, price: -200 },
      ],
    }),
  ],
);
const c = {
  game_id: game,
  name: "Test Player",
  market: "Full game · 40+ receiving yards",
  copy_text: "Test Player 40+ receiving yards",
  book: "FanDuel",
  odds: -200,
  quote_observed_at: stamp,
  quote_source_url: "https://example.com/quote",
  selection_gate: {
    version: "2026-10-16.r1",
    phase: "pregame",
    stat: "receiving_yards",
    direction: "at_least",
    threshold: 40,
    position: "WR",
    team: "SEA",
    history_window: "latest_consecutive_games",
    history_source_url: "https://example.com/logs",
    history: [60, 70, 80, 90, 30].map((value, i) => ({
      game_id: `historical-${i}`,
      value,
      played_at: `2026-09-${10 + i}T00:00:00Z`,
      source_url: "https://example.com/log",
    })),
    model_id: "fixture-approved",
    model_probability: 0.75,
    historical_cutoff: "2026-10-01T00:00:00Z",
    generated_at: stamp,
    forecast_source_url: "https://example.com/model",
    input_hashes: { test: "hash" },
    opportunity_case: "Supported routes and targets",
    failure_path: "Pressure and stalled drives",
    role_source_url: "https://example.com/role",
    availability_source_url: "https://example.com/active",
    availability_verified: true,
    game_script_review: "Leading and trailing scenarios reviewed",
    quote_observation_id: quote,
    initial_quote_observation_id: quote,
  },
};

await db.exec(`create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.has_membership() returns boolean language sql as $$select auth.uid() is not null$$;
create function private.age_member_allowed() returns boolean language sql as $$select auth.uid() is not null$$;
create function private.age_eligible(uuid) returns boolean language sql as $$select true$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
create table private.community_restrictions(user_id uuid);
create table public.ruby_submissions(id uuid primary key);
create table public.ruby_daily_features(day date primary key default (now() at time zone 'America/New_York')::date,submission_id uuid not null references public.ruby_submissions,verified_odds integer not null check(verified_odds>=100),sportsbook text not null,source_url text not null,observed_at timestamptz not null,verified_by uuid references auth.users);
alter table public.ruby_daily_features enable row level security;
create policy ruby_feature_read on public.ruby_daily_features for select to authenticated using(exists(select 1 from public.ruby_submissions r where r.id=submission_id));
create table public.test_notifications(id uuid default gen_random_uuid(),recipient uuid,event_key text unique);
create function private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text) returns uuid language plpgsql as $$begin insert into public.test_notifications(recipient,event_key) values($1,$4);return gen_random_uuid();end$$;
grant usage on schema public,private,auth to authenticated,service_role;
grant execute on all functions in schema auth to authenticated,service_role;
insert into auth.users values('00000000-0000-4000-8000-000000000020',now());`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261025112300_analyst_double_up.sql",
    "utf8",
  ),
);
const leaves = [];
for (let i = 0; i < 3; i++) {
  const leg = structuredClone(c);
  for (const key of ["model_id", "model_probability", "forecast_source_url"])
    delete leg.selection_gate[key];
  leg.name = `Test Player ${i}`;
  leg.copy_text = `${leg.name} 40+ receiving yards`;
  leaves.push(leg);
}
await db.query(
  `update public.source_observations set payload=jsonb_set(payload,'{outcomes}',$1::jsonb) where id=$2`,
  [
    JSON.stringify(
      leaves.map((l) => ({
        description: l.name,
        name: "Over",
        point: 39.5,
        price: -200,
      })),
    ),
    quote,
  ],
);
const combinedQuote = "00000000-0000-4000-8000-000000000030";
const targets = leaves.map((l) => ({
  game_id: l.game_id,
  name: l.name,
  market: l.market,
  odds: l.odds,
}));
await db.query(
  `insert into public.source_observations(id,game_id,kind,observed_at,recorded_at,payload,source) values($1,$2,'odds',now(),now(),$3::jsonb,'https://example.com/complete-slip')`,
  [
    combinedQuote,
    game,
    JSON.stringify({
      book: "FanDuel",
      market: "parlay",
      provider_updated_at: stamp,
      price: 238,
      price_basis: "sportsbook_complete_slip",
      source_sha256: "a".repeat(64),
      legs: targets,
    }),
  ],
);
const generated = new Date().toISOString();
const p = {
  id: "00000000-0000-4000-8000-000000000031",
  title: "Daily analyst fixture",
  candidates: leaves,
  sportsbook: "FanDuel",
  combined_odds: 238,
  quote_observation_id: combinedQuote,
  review: {
    generated_at: generated,
    historical_cutoff: generated,
    correlation_review: "Shared offense and target competition reviewed",
    failure_scenarios: "Stalled drives and pressure",
    market_context: "Quote provenance verified; splits unavailable",
    material_unknowns: "Weather remains uncertain",
    sources: [
      "https://example.com/role",
      "https://example.com/active",
      "https://example.com/logs",
    ].map((url) => ({ url, retrieved_at: stamp, sha256: "a".repeat(64) })),
  },
};
async function publish(payload = p) {
  return db.query("select public.publish_analyst_double_up($1::jsonb) id", [
    JSON.stringify(payload),
  ]);
}
async function rejected(mutator, pattern) {
  const payload = structuredClone(p);
  mutator(payload);
  await assert.rejects(publish(payload), pattern);
  assert.equal(
    (await db.query("select count(*) n from public.nfl_analyst_double_ups"))
      .rows[0].n,
    0,
  );
}
await db.exec("set app.role='authenticated';set role authenticated;");
await assert.rejects(publish(), /Verified admin/);
await db.exec("reset role;set app.role='service_role';");
await rejected(
  (x) => (x.candidates = x.candidates.slice(0, 2)),
  /Three or four/,
);
await rejected(
  (x) => (x.candidates[0].selection_gate.model_probability = 0.9),
  /cannot claim/,
);
await rejected(
  (x) => (x.candidates[0].selection_gate.phase = "halftime"),
  /pregame/,
);
await rejected(
  (x) => (x.candidates[0].selection_gate.availability_verified = false),
  /ANALYST_DOUBLE_UP_BLOCKED/,
);
await rejected(
  (x) =>
    (x.candidates[0].selection_gate.history =
      x.candidates[0].selection_gate.history.slice(0, 4)),
  /ANALYST_DOUBLE_UP_BLOCKED/,
);
await rejected(
  (x) => (x.candidates[0].quote_observed_at = "2026-01-01T00:00:00Z"),
  /ANALYST_DOUBLE_UP_BLOCKED/,
);
await rejected(
  (x) => (x.candidates[0].odds = -300),
  /ANALYST_DOUBLE_UP_BLOCKED/,
);
await rejected(
  (x) => (x.candidates[0].selection_gate.position = "TE"),
  /ANALYST_DOUBLE_UP_BLOCKED/,
);
await rejected(
  (x) => (x.candidates[1] = structuredClone(x.candidates[0])),
  /Duplicate/,
);
await rejected((x) => (x.combined_odds = 100), /complete sportsbook/);
await rejected((x) => (x.review.sources[0].sha256 = "fake"), /SHA256/);
await rejected(
  (x) => (x.review.sources[0].retrieved_at = "2099-01-01T00:00:00Z"),
  /cutoff/,
);
await rejected(
  (x) => (x.review.sources = x.review.sources.slice(1)),
  /Reviewed source/,
);
await db.exec(`update public.games set kickoff=now()+interval '3 hours'`);
await rejected(() => {}, /ANALYST_DOUBLE_UP_BLOCKED/);
await db.exec(`update public.games set kickoff=now()+interval '1 hour'`);
// An earlier contributor feature owns the same date; neither path overwrites it.
await db.exec(
  `insert into public.ruby_submissions values('00000000-0000-4000-8000-000000000040');insert into public.ruby_daily_features(submission_id,verified_odds,sportsbook,source_url,observed_at)values('00000000-0000-4000-8000-000000000040',100,'FanDuel','https://example.com',now())`,
);
await rejected(() => {}, /already featured/);
await db.exec("delete from public.ruby_daily_features");
assert.equal((await publish()).rows[0].id, p.id);
assert.equal((await publish()).rows[0].id, p.id);
assert.equal(
  (await db.query("select count(*) n from public.test_notifications")).rows[0]
    .n,
  1,
);
assert.equal(
  (
    await db.query(
      "select count(*) n from private.nfl_selection_model_approvals",
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*) n from public.candidate_releases")).rows[0]
    .n,
  0,
);
assert.equal(
  (await db.query("select count(*) n from public.official_picks")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("select analyst_ticket_id from public.ruby_daily_features"))
    .rows[0].analyst_ticket_id,
  p.id,
);
await assert.rejects(
  publish({ ...p, id: "00000000-0000-4000-8000-000000000041" }),
  /already featured/,
);
await assert.rejects(
  db.exec("update public.nfl_analyst_double_ups set combined_odds=300"),
  /immutable/,
);
await assert.rejects(
  db.exec("delete from public.nfl_analyst_double_ups"),
  /immutable/,
);
await assert.rejects(
  db.exec(
    `insert into public.ruby_daily_features(day,verified_odds,sportsbook,source_url,observed_at)values(current_date+1,100,'FanDuel','https://example.com',now())`,
  ),
  /exactly_one/,
);
await db.exec("set role anon");
await assert.rejects(
  db.query("select * from public.nfl_analyst_double_ups"),
  /permission denied/,
);
await db.exec("reset role;set role authenticated");
assert.equal(
  (await db.query("select * from public.nfl_analyst_double_ups")).rows.length,
  0,
);
await db.exec("set app.uid='00000000-0000-4000-8000-000000000020'");
assert.equal(
  (await db.query("select * from public.nfl_analyst_double_ups")).rows.length,
  1,
);
await assert.rejects(
  db.exec("delete from public.nfl_analyst_double_ups"),
  /permission denied/,
);
console.log(
  "Analyst Double Up evidence, RLS, shared daily slot, idempotency and unchanged model gate passed",
);
await db.close();
