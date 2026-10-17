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
for (const m of ['20261018060000_nba_source_feed', '20261018070000_nba_results', '20261018080000_nba_shadow'])
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
  market: 'player_points', line: 24.5, over_odds: -110, under_odds: -110, over_probability: 0.56, forecast: { median: 26 }, ...over });
const scan = (forecasts, at = new Date().toISOString(), model = MODEL) =>
  db.query('select public.record_nba_shadow_scan($1) r', [{ model_id: model, generated_at: at, summary: { candidates: forecasts.length }, forecasts }]).then((r) => r.rows[0].r);

// A scan is stored once; replays and repeated snapshots add nothing; no-vig is computed in the database.
const first = await scan([forecast()]);
assert.equal(first.inserted, 1);
assert.deepEqual(await scan([forecast()], new Date(Date.now() - 1000).toISOString()), { inserted: 0, run_id: (await db.query(
  `select id from private.nba_shadow_runs order by recorded_at desc limit 1`)).rows[0].id });
const row = (await db.query('select book, no_vig_over, under_odds from private.nba_shadow_forecasts')).rows[0];
assert.deepEqual([row.book, Number(row.no_vig_over), row.under_odds], ['FanDuel', 0.5, -110]);

// Rejections: prices must match the stored snapshot; the model must be registered; scans must be current.
await assert.rejects(scan([forecast({ over_odds: -105 })]), /Over price does not match/);
await assert.rejects(scan([forecast({ under_odds: -120 })]), /Under price does not match/);
await assert.rejects(scan([forecast({ line: 25.5 })]), /Over price does not match/);
await assert.rejects(scan([forecast({ market: 'player_rebounds' })]), /Market does not match/);
await assert.rejects(scan([forecast({ team: 'Miami Heat' })]), /Team is not in this game/);
await assert.rejects(scan([forecast()], undefined, 'f'.repeat(64)), /Unregistered NBA model/);
await assert.rejects(scan([forecast()], new Date(Date.now() - 20 * 60000).toISOString()), /Scan is not current/);
await db.exec(`alter table public.nba_observations disable trigger immutable_nba_observation;
 update public.nba_observations set recorded_at = now() - interval '40 minutes';
 alter table public.nba_observations enable trigger immutable_nba_observation`);
await assert.rejects(scan([forecast()], new Date(Date.now() - 2000).toISOString()), /Price snapshot is stale/);
await db.exec(`update public.nba_games set tipoff = now() - interval '1 minute'`);
await assert.rejects(scan([forecast()], new Date(Date.now() - 3000).toISOString()), /Game has started/);

// Evaluation: started games only, Over graded by nba_grade, closing price = last same-line snapshot before tip.
await db.exec(`alter table public.nba_observations disable trigger immutable_nba_observation;
 update public.nba_observations set recorded_at = now() - interval '2 hours';
 alter table public.nba_observations enable trigger immutable_nba_observation`);
await db.query('select public.ingest_nba($1)', [{ provider: 'The Odds API NBA props', observations: [prop('1', 'b', outcomes(-125, 105))] }]);
await db.exec(`alter table public.nba_observations disable trigger immutable_nba_observation;
 update public.nba_observations set recorded_at = now() - interval '30 minutes' where fingerprint = 'b';
 alter table public.nba_observations enable trigger immutable_nba_observation`);
const rows = async () => (await db.query(`select * from public.nba_shadow_evaluation_rows($1)`, [MODEL])).rows;
let [ev] = await rows();
assert.deepEqual([ev.result, ev.close_over_odds, ev.close_under_odds, Number(ev.over_probability)], ['PENDING', -125, 105, 0.56]);
await db.exec(`insert into public.nba_game_results(game_id, provider_id, away_score, home_score, fingerprint, source_url, source_hash, first_final_at)
 values('${gameId}', '1', 110, 100, '${'a'.repeat(64)}', 'https://www.espn.com/nba/boxscore/_/gameId/1', '${'b'.repeat(64)}', now());
 insert into public.nba_player_results(game_id, athlete_id, player, team, side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers, starter, position)
 values('${gameId}', '4065648', 'Jayson Tatum', 'Boston Celtics', 'away', true, 36, 30, 8, 5, 4, 1, 0, 2, true, 'F')`);
[ev] = await rows();
assert.equal(ev.result, 'WIN');
assert.equal((await db.query(`select count(*)::int n from public.nba_shadow_evaluation_rows($1, $2)`, [MODEL, ev.id])).rows[0].n, 0);

// Reports and records are immutable and service-only; record_nba_result now stores starter/position.
assert.equal(typeof (await db.query(`select public.record_nba_shadow_report($1) id`, [{ model_id: MODEL, report: { ok: true } }])).rows[0].id, 'number');
await assert.rejects(db.exec(`update private.nba_shadow_forecasts set over_probability = 0.9`), /immutable/);
await assert.rejects(db.exec(`delete from private.nba_shadow_reports`), /immutable/);
const grants = (await db.query(`select has_function_privilege('authenticated','public.record_nba_shadow_scan(jsonb)','execute') a,
 has_function_privilege('anon','public.nba_shadow_evaluation_rows(text,bigint,integer)','execute') b,
 has_function_privilege('service_role','public.record_nba_shadow_scan(jsonb)','execute') s,
 has_table_privilege('service_role','private.nba_shadow_forecasts','select') t`)).rows[0];
assert.deepEqual(grants, { a: false, b: false, s: true, t: false });
assert.match((await db.query(`select prosrc from pg_proc where proname='record_nba_result' and pronamespace='private'::regnamespace`)).rows[0].prosrc, /starter, position/);
console.log('nba shadow ok');
