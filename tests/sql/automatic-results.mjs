import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const g = "00000000-0000-4000-8000-000000000001";
await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema private;create schema auth;grant usage on schema auth to authenticated;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'Immutable';end$$;
create function private.has_membership()returns boolean language sql as $$select coalesce(current_setting('app.member',true),'')='true'$$;
create function private.age_member_allowed()returns boolean language sql as $$select true$$;
grant usage on schema private to authenticated;
create table public.games(id uuid primary key,provider_id text,season integer,week integer,kickoff timestamptz,away_team text,home_team text,away_abbreviation text,home_abbreviation text);
create table public.published_legs(leg_key text,name text,market text,kind text,published_at timestamptz);
create table public.candidate_releases(id uuid,candidates jsonb,created_at timestamptz default now());
create table public.leg_tails(leg_key text,user_id uuid);alter table public.leg_tails enable row level security;grant select on public.leg_tails to authenticated;
create policy tails_owner on public.leg_tails for select to authenticated using(user_id=auth.uid());
create table public.research_leg_results(leg_key text primary key,result text,source_url text);
create table public.feed_runs(id uuid default gen_random_uuid(),provider text,status text,details jsonb);
create table public.research_feed_posts(id uuid default gen_random_uuid(),game_id uuid,category text,title text,summary text,matchup text,away_code text,home_code text,market_label text,why_watch text,caution text,next_check text,source_url text,source_at timestamptz);
grant usage on schema public to service_role,authenticated,anon;
insert into games values('${g}','123',2026,5,now()-interval '1 day','Buffalo Bills','Los Angeles Rams','BUF','LAR');
insert into published_legs values('candidate:r:1','James Cook','Full game · 70+ rushing yards','SINGLE',now()+interval '1 minute');
`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261014172417_automatic_leg_results.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261014172844_editorial_progress_own_tails.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261016142733_defensive_sack_contract_and_correction_evidence.sql",
    "utf8",
  ),
);
const c = {
  leg_key: "candidate:r:1",
  game_id: g,
  player: "James Cook",
  team: "Buffalo Bills",
  metric: "rushing_yards",
  threshold: 70,
  operator: "gte",
  period: "full_game",
  market: "Full game · 70+ rushing yards",
};
await db.exec("set role service_role");
await db.query("select public.register_result_contracts($1::jsonb)", [
  JSON.stringify([c]),
]);
const retrieved = new Date(Date.now() - 1000).toISOString();
const a = {
  event_id: "123",
  completed: true,
  value: 111,
  hash: "a".repeat(64),
  retrieved_at: retrieved,
  source_url: "https://www.espn.com/nfl/boxscore/_/gameId/123",
};
const b = {
  value: 111,
  hash: "b".repeat(64),
  retrieved_at: retrieved,
  source_url:
    "https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv",
};
const finalize = (a, b) =>
  db.query(
    "select public.finalize_editorial_leg($1,$2::jsonb,$3::jsonb) as r",
    ["candidate:r:1", JSON.stringify(a), JSON.stringify(b)],
  );
await assert.rejects(finalize({ ...a, completed: false }, b));
await assert.rejects(finalize({ ...a, event_id: "wrong" }, b));
await assert.rejects(finalize({ ...a, completed: null }, b));
await assert.rejects(finalize(a, { ...b, value: 110 }));
assert.equal((await finalize(a, b)).rows[0].r.inserted, true);
assert.equal((await finalize(a, b)).rows[0].r.inserted, false);
assert.equal(
  (await finalize({ ...a, value: 69 }, { ...b, value: 69 })).rows[0].r.conflict,
  true,
);
assert.equal(
  (await db.query("select count(*)::int as n from research_feed_posts")).rows[0]
    .n,
  1,
);
assert.equal(
  (await db.query("select result from research_leg_results")).rows[0].result,
  "WIN",
);
// A later provider correction is journaled, deduped, and cannot rewrite the original WIN.
const correction = (x, y) =>
  db.query(
    "select public.observe_editorial_correction($1,$2::jsonb,$3::jsonb) r",
    ["candidate:r:1", JSON.stringify(x), JSON.stringify(y)],
  );
assert.equal(
  (await correction({ ...a, value: 69 }, { ...b, value: 69 })).rows[0].r
    .recorded,
  true,
);
assert.equal(
  (await correction({ ...a, value: 69 }, { ...b, value: 69 })).rows[0].r
    .recorded,
  false,
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.editorial_stat_correction_observations",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await db.query(
      "select result from research_leg_results where leg_key='candidate:r:1'",
    )
  ).rows[0].result,
  "WIN",
);
await assert.rejects(
  correction({ ...a, completed: false, value: 69 }, { ...b, value: 69 }),
);
await db.exec("reset role");
const sackId = "00000000-0000-4000-8000-000000000008",
  sackKey = `candidate:${sackId}:1`;
const sackCandidate = {
  name: "Test Defender",
  game_id: g,
  book: "FanDuel",
  market: "Full game · Over 0.5 sacks",
  sack_market_type: "numeric_total",
  sack_settlement_review: {
    source_url: "https://example.com/exact-rules",
    observed_at: new Date(Date.now() - 3600000).toISOString(),
  },
};
await db.query(
  "insert into candidate_releases(id,candidates)values($1,$2::jsonb)",
  [sackId, JSON.stringify([sackCandidate])],
);
await db.query(
  "insert into published_legs values($1,'Test Defender','Full game · Over 0.5 sacks','SINGLE',now())",
  [sackKey],
);
const sack = {
  ...c,
  leg_key: sackKey,
  player: "Test Defender",
  metric: "def_sacks",
  threshold: 0.5,
  operator: "over",
  market: sackCandidate.market,
};
await db.exec("set role service_role");
await assert.rejects(
  db.query("select public.register_result_contracts($1::jsonb)", [
    JSON.stringify([{ ...sack, threshold: 0.25 }]),
  ]),
);
await db.query("select public.register_result_contracts($1::jsonb)", [
  JSON.stringify([sack]),
]);
const numericFinal = (value) =>
  db.query("select public.finalize_editorial_leg($1,$2::jsonb,$3::jsonb) r", [
    sackKey,
    JSON.stringify({ ...a, value }),
    JSON.stringify({ ...b, value }),
  ]);
await assert.rejects(numericFinal(0.25));
assert.equal((await numericFinal(0.5)).rows[0].r.result, "PUSH");
assert.equal(
  (
    await db.query("select result from research_leg_results where leg_key=$1", [
      sackKey,
    ])
  ).rows[0].result,
  "PUSH",
);
await db.exec("reset role;set role authenticated");
await assert.rejects(finalize(a, b));
await assert.rejects(correction({ ...a, value: 69 }, { ...b, value: 69 }));
await assert.rejects(
  db.query("select public.register_result_contracts($1::jsonb)", [
    JSON.stringify([c]),
  ]),
);
await assert.rejects(
  db.query(
    "insert into leg_result_progress(leg_key,status,reason,source_url)values('candidate:r:1','FINAL','fake','https://fake')",
  ),
);
await db.exec(
  "reset role;insert into leg_tails values('candidate:r:1','00000000-0000-4000-8000-000000000002');insert into leg_result_progress(leg_key,status,reason,source_url)values('candidate:r:1','CONFLICT','correction','https://example.com');set role authenticated;set app.uid='00000000-0000-4000-8000-000000000002'",
);
assert.equal(
  (await db.query("select count(*)::int n from leg_result_progress")).rows[0].n,
  1,
);
await db.exec("set app.uid='00000000-0000-4000-8000-000000000003'");
assert.equal(
  (await db.query("select count(*)::int n from leg_result_progress")).rows[0].n,
  0,
);
await db.close();
console.log(
  "Automatic result transaction: mismatches rejected, deduped, immutable correction flagged, member writes denied.",
);
