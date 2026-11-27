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
  season: 2027, season_type: 2, status: 'STATUS_SCHEDULED', away_score: null, home_score: null,
  source: 'https://www.espn.com/nba/game/_/gameId/401810001', ...over });
const obs = (fp, id) => ({ provider_id: id, kind: 'prop', source: 'https://api.the-odds-api.com/v4/sports/basketball_nba/events/e/odds',
  observed_at: '2026-10-20T15:00:00Z', fingerprint: fp, payload: { book: 'FanDuel', market: 'player_points' } });
const tbd = (id, over = {}) => game({ provider_id: id, slug: 'tbd-tbd-20261204', away_team: 'TBD', home_team: 'TBD',
  away_abbreviation: 'TBD', home_abbreviation: 'TBD', tipoff: '2026-12-04T00:00:00Z', season_type: 2,
  source: `https://www.espn.com/nba/game/_/gameId/${id}`, ...over });

// The real case (2026-11-27): one knockout placeholder already stored, the next one on the same date fails the batch.
await ingest({ provider: 'ESPN NBA', games: [tbd('401909450')] });
await assert.rejects(ingest({ provider: 'ESPN NBA', games: [game(), tbd('401909450'), tbd('401909451')] }), /nba_games_slug_key/);
assert.equal((await db.query("select count(*)::int n from public.nba_games")).rows[0].n, 1, 'the failed batch stored nothing');

await db.exec(readFileSync('supabase/migrations/20261127230000_nba_tbd_placeholders.sql', 'utf8'));

// Placeholders are skipped; the real games in the same batch are stored, with their observations.
await ingest({ provider: 'ESPN NBA', games: [game(), tbd('401909450'), tbd('401909451'), tbd('401909452')],
  observations: [obs('lac-quote', '401810001')] });
const all = (await db.query("select provider_id, slug from public.nba_games order by provider_id")).rows;
assert.deepEqual(all, [{ provider_id: '401810001', slug: 'lac-bos-20261020' }, { provider_id: '401909450', slug: 'tbd-tbd-20261204' }]);

// When ESPN names the teams (same event id), the stored placeholder takes them; the others are inserted.
const stored = (await db.query("select id from public.nba_games where provider_id='401909450'")).rows[0].id;
const named = (id, away, home, a, h) => game({ provider_id: id, slug: `${a}-${h}-20261203`.toLowerCase(), away_team: away, home_team: home,
  away_abbreviation: a, home_abbreviation: h, tipoff: '2026-12-04T00:00:00Z', source: `https://www.espn.com/nba/game/_/gameId/${id}` });
await ingest({ provider: 'ESPN NBA', games: [named('401909450', 'Miami Heat', 'New York Knicks', 'MIA', 'NY'),
  named('401909451', 'Orlando Magic', 'Milwaukee Bucks', 'ORL', 'MIL')] });
const upgraded = (await db.query("select id, slug, away_team, home_team, away_abbreviation, home_abbreviation from public.nba_games where provider_id='401909450'")).rows[0];
assert.deepEqual(upgraded, { id: stored, slug: 'mia-ny-20261203', away_team: 'Miami Heat', home_team: 'New York Knicks', away_abbreviation: 'MIA', home_abbreviation: 'NY' });
assert.equal((await db.query("select slug from public.nba_games where provider_id='401909451'")).rows[0].slug, 'orl-mil-20261203');

// Real teams are never overwritten, and ordinary score updates still apply.
await ingest({ provider: 'ESPN NBA', games: [game({ away_team: 'Somebody Else', slug: 'x-y-20261020', status: 'STATUS_FINAL', away_score: 101, home_score: 99 })] });
const lac = (await db.query("select slug, away_team, status, away_score from public.nba_games where provider_id='401810001'")).rows[0];
assert.deepEqual(lac, { slug: 'lac-bos-20261020', away_team: 'Los Angeles Clippers', status: 'STATUS_FINAL', away_score: 101 });
assert.deepEqual((await db.query("select fingerprint from public.nba_observations order by fingerprint")).rows.map((r) => r.fingerprint), ['lac-quote']);

for (const role of ['anon', 'authenticated'])
  assert.equal((await db.query("select has_function_privilege($1,'private.ingest_nba(jsonb)','execute') p", [role])).rows[0].p, false);
console.log('PASS NBA Cup TBD placeholders are skipped, then take their teams; the feed no longer fails');
await db.close();
