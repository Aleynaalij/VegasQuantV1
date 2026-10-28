import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema cron; create schema vault; create schema net;
create function private.immutable() returns trigger language plpgsql as $$ begin raise exception 'immutable'; end $$;
create function private.has_membership() returns boolean language sql as $$ select true $$;
create function private.age_member_allowed() returns boolean language sql as $$ select true $$;
create table public.feed_runs(id serial, provider text, status text, details jsonb, created_at timestamptz default now());
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(n text,s text,c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) returning 1 $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
`);
for (const m of ['20261018060000_nba_source_feed', '20261018070000_nba_results', '20261018080000_nba_shadow', '20261018090000_nba_shadow_hardening'])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, 'utf8'));
const MODEL = '20df1c2b74b1f013fa472bb348bdfcf234455ab73de40ec057f5108e59e350e4';
const hours = (h) => new Date(Date.now() + h * 3600000).toISOString();
const game = (id, tip) => ({ provider_id: id, slug: `g-${id}`, away_team: 'Boston Celtics', home_team: 'New York Knicks', tipoff: tip,
  source: `https://www.espn.com/nba/game/_/gameId/${id}` });
const outcomes = (over, under, point = 24.5, player = 'Jayson Tatum') =>
  [{ name: 'Over', description: player, point, price: over }, { name: 'Under', description: player, point, price: under }];
const prop = (id, fp, outs, market = 'player_points') => ({ provider_id: id, kind: 'prop', source: 'https://api.the-odds-api.com/v4/sports/basketball_nba/events/e/odds',
  observed_at: new Date(Date.now() - 60000).toISOString(), fingerprint: fp, payload: { book: 'FanDuel', market, outcomes: outs } });
await db.query('select public.ingest_nba($1)', [{ provider: 'The Odds API NBA props', games: [game('1', hours(5))],
  observations: [prop('1', 'a', outcomes(-110, -110))] }]);
const obs = (await db.query(`select id from public.nba_observations where fingerprint='a'`)).rows[0].id;
const gameId = (await db.query(`select id from public.nba_games where provider_id='1'`)).rows[0].id;
const forecast = (over = {}) => ({ observation_id: obs, athlete_id: '4065648', player: 'Jayson Tatum', team: 'Boston Celtics',
  market: 'player_points', line: 24.5, over_odds: -110, under_odds: -110, over_probability: 0.56, forecast: { median: 26, history_through: '2026-04-12', history_games: 70 }, ...over });
const INPUTS = [{ file: 'player_box_2026.csv', sha256: 'c'.repeat(64) }, { file: 'player_box_2027.csv', sha256: 'd'.repeat(64) }];
const scan = (forecasts, at = new Date().toISOString(), model = MODEL, inputs = INPUTS) =>
  db.query('select public.record_nba_shadow_scan($1) r', [{ model_id: model, generated_at: at, summary: { candidates: forecasts.length, inputs }, forecasts }]).then((r) => r.rows[0].r);


// The dispatcher and daily-collection migrations this one builds on.
await db.exec(`create table vault.decrypted_secrets(name text, decrypted_secret text);
 create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
 create function net.http_post(url text, body jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 0) returns bigint
  language sql as $$ insert into net.calls(url, body, headers) values(url, body, headers) returning id $$;
 create table net._http_response(id bigint, status_code int);
 create table private.workflow_dispatches(workflow text primary key, last_source_at timestamptz not null, dispatched_at timestamptz not null default now(),
  request_id bigint, attempts int not null default 1);
 insert into vault.decrypted_secrets values('vq_source_sync_token','sync-token');`);
for (const m of ['20261019010000_nba_shadow_scan_dispatch', '20261022010000_nba_daily_collection', '20261028233000_nba_shadow_restart_pretip'])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, 'utf8').replace(/create extension[^;]*;/g, ''));
const jobs = Object.fromEntries((await db.query('select jobname, schedule from cron.job')).rows.map((r) => [r.jobname, r.schedule]));
assert.equal(jobs['nba-shadow-scan-dispatch'], '*/5 * * * *');
assert.equal(jobs['nba-pretip-refresh'], '*/10 * * * *');
assert.equal(jobs['nba-source-refresh'], '0 10,11 * * *');

// One bad forecast no longer voids the batch: good forecasts are stored, the bad one is counted by reason.
const t0 = Date.now();
const mixed = await scan([forecast(), forecast({ over_odds: -105, line: 24.5, player: 'Jayson Tatum' }), forecast({ team: 'Miami Heat' }),
  forecast({ observation_id: 'not-a-uuid' })], new Date(t0).toISOString());
assert.equal(mixed.inserted, 1);
assert.deepEqual(mixed.rejected, { 'Over price does not match the snapshot': 1, 'Team is not in this game': 1, 'Malformed forecast': 1 });
const run = (await db.query('select summary from private.nba_shadow_runs where id = $1', [mixed.run_id])).rows[0].summary;
assert.equal(run.accepted, 1);
assert.deepEqual(run.rejected, mixed.rejected);
assert.equal(run.candidates, 4);
const row = (await db.query('select book, no_vig_over, under_odds, run_id from private.nba_shadow_forecasts')).rows;
assert.equal(row.length, 1);
assert.deepEqual([row[0].book, Number(row[0].no_vig_over), row[0].under_odds, row[0].run_id], ['FanDuel', 0.5, -110, mixed.run_id]);
// Replays add nothing; a scan where every forecast fails is still journaled with its reasons.
assert.deepEqual(await scan([forecast()], new Date(t0).toISOString()), { inserted: 0, replay: true });
const none = await scan([forecast({ market: 'player_rebounds' })], new Date(t0 + 1).toISOString());
assert.deepEqual([none.inserted, none.rejected], [0, { 'Market does not match the snapshot': 1 }]);
// Whole-scan rules still reject the scan.
await assert.rejects(scan([forecast()], undefined, 'f'.repeat(64)), /Unregistered NBA model/);
await assert.rejects(scan([forecast()], new Date(Date.now() - 20 * 60000).toISOString()), /Scan is not current/);
await assert.rejects(scan([forecast()], new Date(Date.now() - 10).toISOString(), MODEL, []), /missing its input hashes/);
await assert.rejects(db.exec(`update private.nba_shadow_runs set summary = '{}'`), /immutable/);

// Pre-tip refresh: once per Eastern day, only 60-90 minutes before the first tip, through nba-sync.
const pretip = async (minutes) => {
  await db.exec(`delete from net.calls; delete from private.nba_pretip_runs; update public.nba_games set season_type = 2, tipoff_tbd = false`);
  await db.query(`update public.nba_games set tipoff = now() + make_interval(mins => $1)`, [minutes]);
  await db.exec('select private.nba_pretip_sync()');
  return (await db.query('select url, headers from net.calls')).rows;
};
// Keep the test away from the Eastern midnight boundary, where "today" and the game's date can differ.
const etHour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
if (etHour >= 1 && etHour <= 21) {
  assert.equal((await pretip(120)).length, 0);
  assert.equal((await pretip(45)).length, 0);
  const sent = await pretip(75);
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /functions\/v1\/nba-sync$/);
  assert.equal(sent[0].headers.Authorization, 'Bearer sync-token');
  await db.exec('select private.nba_pretip_sync()');
  assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n, 1); // once a day
}
console.log('nba shadow restart ok: per-forecast rejections counted, whole-scan rules kept, dispatcher and pre-tip refresh scheduled');
