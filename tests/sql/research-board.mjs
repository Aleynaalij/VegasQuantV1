import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";

const migration = (name) => fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), "utf8");
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

const game = "00000000-0000-4000-8000-000000000001", stage = "00000000-0000-4000-8000-000000000009";
await db.query(`insert into games values($1,'NFL',now()+interval '1 day',false,'LAR','BUF')`, [game]);
await db.query(`insert into challenge_stages values($1,$2)`, [stage, game]);
const observed = new Date(Date.now() - 3600000).toISOString();
await db.query(`insert into source_observations(game_id,kind,observed_at,recorded_at,payload) values($1,'odds',$2,now(),$3::jsonb)`, [
  game, observed,
  JSON.stringify({ book: "FanDuel", market: "player_rush_yds_alternate", outcomes: [
    { name: "Over", description: "James Cook", point: 59.5, price: -200 },
    { name: "Over", description: "Kyren Williams", point: 49.5, price: -250 },
  ] }),
]);
const leg = (over = {}) => ({
  research: true, analysis_kind: "RESEARCH_BOARD", name: "James Cook", market: "Full game · 60+ rushing yards",
  matchup: "Buffalo Bills @ Los Angeles Rams", game_id: game, book: "FanDuel", odds: -200, quote_observed_at: observed,
  why: "Cleared 60+ in 5 of his last 5.", risk: "Research lean.", sources: [], pick_of_day: false, fun_play: false,
  research_evidence: { cleared: 5, sample: 5 }, ...over,
});
const publish = (candidates, expires = "now()+interval '23 hours'") =>
  db.query(`insert into candidate_releases(stage_id,candidates,expires_at) values($1,$2::jsonb,${expires}) returning id`, [stage, JSON.stringify(candidates)]);
const blocked = async (candidates, pattern, expires) => {
  await assert.rejects(publish(candidates, expires), (e) => (pattern.test(`${e.message} ${e.detail || ""}`) ? true : assert.fail(`${e.message} ${e.detail}`)));
};

// A valid research board publishes without the model gate and is journaled.
const ok = await publish([leg()]);
const kinds = await db.query(`select kind from published_legs where release_id=$1`, [ok.rows[0].id]);
assert.deepEqual(kinds.rows.map((r) => r.kind), ["RESEARCH"]);
assert.equal((await db.query(`select count(*)::int n from private.nfl_selection_gate_decisions where entity='research_board' and accepted`)).rows[0].n, 1);
// It never repeats a selection, and a research leg does not reserve the official identity.
await blocked([leg()], /already published/);
assert.equal((await db.query(`select count(*)::int n from private.nfl_selection_identities`)).rows[0].n, 0);

const second = leg({ name: "Kyren Williams", market: "Full game · 50+ rushing yards", odds: -250, research_evidence: { cleared: 5, sample: 5 } });
await blocked([{ ...second, odds: -240 }], /exact recent FanDuel observation/); // price not observed
await blocked([{ ...second, quote_observed_at: new Date().toISOString() }], /exact recent FanDuel observation/);
await blocked([{ ...second, research_evidence: { cleared: 3, sample: 5 } }], /beat break-even/); // 60% vs 71% break-even
await blocked([{ ...second, odds: -120 }], /-150 to -299/);
await blocked([{ ...second, market: "1st half · 50+ rushing yards" }], /N\+ player stat/);
await blocked([second], /expire by kickoff/, "now()+interval '2 days'");
await blocked([{ ...second, sources: undefined }], /sources required/);
// Any non-research leg in the release sends the whole release through the full gate.
await blocked([second, { ...second, research: false }], /NFL_SELECTION_GATE_BLOCKED/);
await blocked([{ ...second, pick_of_day: true }], /NFL_SELECTION_GATE_BLOCKED/);
// A past game is never a research leg.
await db.query(`update games set kickoff=now()-interval '1 hour' where id=$1`, [game]);
await blocked([second], /upcoming NFL game/, "now()-interval '2 hours'");
await db.query(`update games set kickoff=now()+interval '1 day' where id=$1`, [game]);
await publish([second]);

// The publishing job inserts as service_role: the trigger condition must be callable by it.
await db.exec(`grant insert, select on candidate_releases to service_role; grant usage on schema private to service_role;`);
const asService = (candidates) =>
  db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    await tx.query(`insert into candidate_releases(stage_id,candidates,expires_at) values($1,$2::jsonb,now()+interval '23 hours')`, [stage, JSON.stringify(candidates)]);
  });
const third = leg({ name: "Third Back", market: "Full game · 30+ rushing yards", odds: -180 });
await db.query(`insert into source_observations(game_id,kind,observed_at,recorded_at,payload) values($1,'odds',$2,now(),$3::jsonb)`, [
  game, observed, JSON.stringify({ book: "FanDuel", market: "player_rush_yds", outcomes: [{ name: "Over", description: "Third Back", point: 29.5, price: -180 }] }),
]);
await assert.rejects(asService([third]), /permission denied for function is_research_release/);
await db.exec(migration("20261017001000_research_board_grant.sql"));
await asService([third]);
console.log("research board: ok");
