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
const migration = readFileSync('supabase/migrations/20261018060000_nba_source_feed.sql', 'utf8');
await db.exec(migration);
const ingest = async (p) => (await db.query('select public.ingest_nba($1) r', [p])).rows[0].r;
const game = (over = {}) => ({ provider_id: '401810001', slug: 'lac-bos-20261020', away_team: 'Los Angeles Clippers', home_team: 'Boston Celtics',
  away_abbreviation: 'LAC', home_abbreviation: 'BOS', tipoff: '2026-10-20T23:30:00Z', tipoff_tbd: false, venue: 'Sample Arena',
  season: 2027, season_type: 2, status: 'STATUS_SCHEDULED', away_score: null, home_score: null, source: 'https://www.espn.com/nba/game/_/gameId/401810001', ...over });
const obs = (fp, over = {}) => ({ provider_id: '401810001', kind: 'prop', source: 'https://api.the-odds-api.com/v4/sports/basketball_nba/events/e/odds',
  observed_at: '2026-10-20T15:00:00Z', fingerprint: fp, payload: { book: 'FanDuel', market: 'player_points' }, ...over });

// Games upsert by ESPN id; observations dedupe by fingerprint; unknown games are skipped; each call logs a run.
assert.deepEqual(await ingest({ provider: 'ESPN NBA', games: [game()], observations: [obs('a'), obs('a'), obs('b', { provider_id: '999' })] }), { inserted: 1 });
assert.deepEqual(await ingest({ provider: 'ESPN NBA', games: [game({ status: 'STATUS_FINAL', away_score: 112, home_score: 104, tipoff: '2026-10-20T23:40:00Z' })] }), { inserted: 0 });
const g = (await db.query('select * from public.nba_games')).rows;
assert.equal(g.length, 1);
assert.deepEqual([g[0].status, g[0].away_score, g[0].home_score, g[0].tipoff.toISOString()], ['STATUS_FINAL', 112, 104, '2026-10-20T23:40:00.000Z']);
// A later run without scores (e.g. a re-read) never wipes a final score.
await ingest({ provider: 'ESPN NBA', games: [game({ status: 'STATUS_FINAL', away_score: null, home_score: null, tipoff: '2026-10-20T23:40:00Z' })] });
assert.equal((await db.query('select away_score from public.nba_games')).rows[0].away_score, 112);
const runs = (await db.query(`select provider, status, details from public.feed_runs order by id`)).rows;
assert.deepEqual(runs.map((r) => [r.provider, r.status, r.details.inserted]), [['ESPN NBA', 'ok', 1], ['ESPN NBA', 'ok', 0], ['ESPN NBA', 'ok', 0]]);
await ingest({ provider: 'The Odds API NBA', status: 'not configured', details: { lines_enabled: false } });
assert.equal((await db.query(`select status from public.feed_runs order by id desc limit 1`)).rows[0].status, 'not configured');

// Rejections and immutability.
await assert.rejects(ingest({ provider: 'ESPN NBA', games: [game({ provider_id: 'abc' })] }), /Incomplete NBA fixture/);
await assert.rejects(ingest({ provider: 'x', observations: [obs('c', { kind: 'pick' })] }), /check/);
await assert.rejects(db.exec(`update public.nba_observations set provider='x'`), /immutable/);

// Settings: lines on, props off, four core markets; readable only by the service role.
const s = (await db.query('select public.nba_feed_settings() s')).rows[0].s;
assert.deepEqual([s.lines_enabled, s.props_enabled, s.prop_markets, s.max_prop_events], [true, false, ['player_points', 'player_rebounds', 'player_assists', 'player_threes'], 15]);
const grants = (await db.query(`select has_function_privilege('authenticated','public.ingest_nba(jsonb)','execute') a,
 has_function_privilege('anon','public.nba_feed_settings()','execute') b, has_function_privilege('service_role','public.ingest_nba(jsonb)','execute') s,
 has_table_privilege('anon','public.nba_games','select') games_public, has_table_privilege('anon','public.nba_observations','insert') obs_insert`)).rows[0];
assert.deepEqual(grants, { a: false, b: false, s: true, games_public: true, obs_insert: false });
assert.match((await db.query(`select command from cron.job where jobname='nba-source-refresh'`)).rows[0].command, /functions\/v1\/nba-sync/);
console.log('nba source feed ok');
