import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private;
create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
create table public.games(id uuid primary key, kickoff timestamptz);
create table public.source_observations(id uuid primary key default gen_random_uuid(), game_id uuid, kind text, observed_at timestamptz, payload jsonb);
create table private.nfl_shadow_model_manifests(model_id text primary key);
create table private.nfl_shadow_scan_runs(id uuid primary key, model_id text, generated_at timestamptz, scan jsonb);
insert into private.nfl_shadow_scan_runs values('00000000-0000-0000-0000-0000000000a1','m',now()-interval '2 days',
 '{"coverage":{"cards":3,"priced":3,"unavailable":0},"blocker_counts":{"Quote older than 15 minutes":1}}'),
 ('00000000-0000-0000-0000-0000000000a2','m',now()-interval '3 days','{"coverage":{"cards":5,"priced":0,"unavailable":5},"reason":"No props"}');
create table private.nfl_shadow_forecasts(id uuid primary key, run_id uuid default '00000000-0000-0000-0000-0000000000a1', observation_id uuid, game_id uuid references public.games(id), model_id text, player text,
 market text, direction text, line numeric, forecast jsonb, recorded_at timestamptz default now());
insert into private.nfl_shadow_model_manifests values('m');
insert into public.games values('00000000-0000-0000-0000-000000000001', now()-interval '1 day'),('00000000-0000-0000-0000-000000000002', now()-interval '1 hour');
`);
const quote = (odds) => ({ player_id: 'p1', season: 2026, week: 7, team: 'SEA', odds, provider_market: 'player_rush_yds_alternate' });
for (const [id, game, line] of [['f1', 1, 40.5], ['f2', 1, 60.5], ['f3', 2, 40.5]])
  await db.query(`insert into private.nfl_shadow_forecasts(id,game_id,model_id,player,market,direction,line,forecast)
   values($1,$2,'m','Test Player','rushing','over',$3,$4)`,
   [`00000000-0000-0000-0000-00000000000${id[1]}`, `00000000-0000-0000-0000-00000000000${game}`, line,
    { quote: quote(-200), position: 'RB', research_probability: 0.75, push_probability: 0, no_vig_market_probability: 0.64, estimated_edge_pp: 8.3 }]);
// Two FanDuel snapshots before kickoff; the later one is the closing price.
const snap = (ago, price) => db.query(`insert into public.source_observations(game_id,kind,observed_at,payload) values
 ('00000000-0000-0000-0000-000000000001','odds',now()-interval '1 day'-$1::interval,$2)`,
 [ago, { book: 'FanDuel', market: 'player_rush_yds_alternate', outcomes: [{ description: 'Test Player', name: 'Over', point: 40.5, price }] }]);
await snap('3 hours', -200); await snap('10 minutes', -230);
await db.exec(readFileSync('supabase/migrations/20261018040000_nfl_shadow_outcomes.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261018051000_shadow_evaluation_pending.sql', 'utf8'));

// Ungraded forecasts of finished games (six hours after kickoff) are pending.
const pending = (await db.query('select * from public.nfl_shadow_pending_outcomes()')).rows;
assert.deepEqual(pending.map((p) => p.forecast_id).sort(), ['00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002']);
assert.deepEqual([pending[0].player_id, pending[0].season, pending[0].week, pending[0].team], ['p1', 2026, 7, 'SEA']);
const src = { source_url: 'https://example.test/stats.csv', source_sha256: 'b'.repeat(64) };
const record = async (o) => (await db.query('select public.record_nfl_shadow_outcomes($1) r', [o])).rows[0].r;
assert.deepEqual(await record([{ forecast_id: '00000000-0000-0000-0000-000000000001', yards: 55, ...src },
  { forecast_id: '00000000-0000-0000-0000-000000000002', void: true, ...src }]), { inserted: 2, replayed: 0, corrected: 0 });
// Replays are idempotent. A corrected final is appended as a new version; the original stays.
assert.deepEqual(await record([{ forecast_id: '00000000-0000-0000-0000-000000000001', yards: 55, ...src },
  { forecast_id: '00000000-0000-0000-0000-000000000001', yards: 20, ...src }]), { inserted: 0, replayed: 1, corrected: 1 });
assert.deepEqual(await record([{ forecast_id: '00000000-0000-0000-0000-000000000001', yards: 20, ...src }]), { inserted: 0, replayed: 1, corrected: 0 });
assert.equal(Number((await db.query('select yards from private.nfl_shadow_outcomes where forecast_id=$1', ['00000000-0000-0000-0000-000000000001'])).rows[0].yards), 55);
await assert.rejects(record([{ forecast_id: '00000000-0000-0000-0000-000000000003', yards: 10, ...src }]), /unfinished/);
await assert.rejects(db.exec('update private.nfl_shadow_outcomes set yards=1'), /immutable/);
await assert.rejects(db.exec('delete from private.nfl_shadow_outcome_corrections'), /immutable/);
// Graded forecasts are re-read for 21 days so later corrections are seen, then drop out.
assert.equal((await db.query('select count(*)::int n from public.nfl_shadow_pending_outcomes()')).rows[0].n, 2);
await db.exec(`update public.games set kickoff=now()-interval '22 days' where id='00000000-0000-0000-0000-000000000001'`);
assert.equal((await db.query('select count(*)::int n from public.nfl_shadow_pending_outcomes()')).rows[0].n, 0);

// Keyset paging: one row a page, continuing after the last id.
const page1 = (await db.query(`select forecast_id from public.nfl_shadow_evaluation_rows('m', null, 1)`)).rows;
const page2 = (await db.query(`select forecast_id from public.nfl_shadow_evaluation_rows('m', $1, 1)`, [page1[0].forecast_id])).rows;
assert.deepEqual([page1.length, page2.length], [1, 1]);
assert.ok(page2[0].forecast_id > page1[0].forecast_id);
assert.equal((await db.query(`select count(*)::int n from public.nfl_shadow_evaluation_rows('m', null, 5000)`)).rows[0].n, 3); // capped at 1,000
// Every captured forecast is returned; the one still in progress is flagged, not dropped.
const all = (await db.query(`select * from public.nfl_shadow_evaluation_rows('m') order by forecast_id`)).rows;
assert.deepEqual(all.map((r) => [r.graded, r.finished]), [[true, true], [true, true], [false, false]]);
const rows = all.filter((r) => r.graded).sort((a, b) => Number(a.line) - Number(b.line));
// The evaluation uses the corrected value and counts the correction.
assert.deepEqual([Number(rows[0].yards), rows[0].corrections, Number(rows[0].odds), rows[0].player_position, rows[0].season, rows[0].week, rows[0].team],
  [20, 1, -200, 'RB', 2026, 7, 'SEA']);
assert.equal(rows[1].void, true); assert.equal(rows[1].closing_odds, null); // no closing quote for that line

// Scan coverage lists every run, including ones that recorded no forecast.
const runs = (await db.query(`select * from public.nfl_shadow_scan_coverage('m')`)).rows;
// Ordered by run id for keyset paging.
assert.deepEqual(runs.map((r) => [r.recorded_forecasts, r.coverage.cards, r.reason]), [[3, 3, null], [0, 5, 'No props']]);
assert.deepEqual(runs[0].blocker_counts, { 'Quote older than 15 minutes': 1 });
const id = (await db.query(`select public.record_nfl_qualification_report('m','qualification-2026-10-16','{"scopes":{}}') id`)).rows[0].id;
assert.ok(id);
const grants = (await db.query(`select has_function_privilege('authenticated','public.record_nfl_shadow_outcomes(jsonb)','execute') a,
 has_function_privilege('anon','public.nfl_shadow_evaluation_rows(text,uuid,int)','execute') b,
 has_function_privilege('authenticated','public.nfl_shadow_scan_coverage(text,uuid,int)','execute') c,
 has_function_privilege('service_role','public.nfl_shadow_pending_outcomes(uuid,int)','execute') s`)).rows[0];
assert.deepEqual(grants, { a: false, b: false, c: false, s: true });
console.log('nfl shadow outcomes ok');
