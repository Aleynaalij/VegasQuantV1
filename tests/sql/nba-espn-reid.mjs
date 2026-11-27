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
const reissued = game({ provider_id: '401819999', source: 'https://www.espn.com/nba/game/_/gameId/401819999' });
const other = game({ provider_id: '401810002', slug: 'mia-ny-20261020', away_team: 'Miami Heat', home_team: 'New York Knicks',
  away_abbreviation: 'MIA', home_abbreviation: 'NY', source: 'https://www.espn.com/nba/game/_/gameId/401810002' });

await ingest({ provider: 'ESPN NBA', games: [game()], observations: [obs('old-quote', '401810001')] });
const before = (await db.query("select id from public.nba_games where slug='lac-bos-20261020'")).rows[0].id;

// Negative control: the original function fails the whole batch on a re-issued ESPN id.
await assert.rejects(ingest({ provider: 'ESPN NBA', games: [reissued, other] }), /nba_games_slug_key/);
assert.equal((await db.query("select count(*)::int n from public.nba_games")).rows[0].n, 1, 'the failed batch stored nothing');

await db.exec(readFileSync('supabase/migrations/20261127230000_nba_espn_reid.sql', 'utf8'));

// Same slug, new ESPN id: the stored game moves to the new id; the rest of the batch is stored.
await ingest({ provider: 'ESPN NBA', games: [reissued, other], observations: [obs('new-quote', '401819999')] });
const rows = (await db.query("select id, provider_id, slug, source from public.nba_games order by slug")).rows;
assert.equal(rows.length, 2);
const lac = rows.find((r) => r.slug === 'lac-bos-20261020');
assert.equal(lac.id, before, 'same game row (uuid kept)');
assert.equal(lac.provider_id, '401819999');
assert.equal(lac.source, 'https://www.espn.com/nba/game/_/gameId/401819999');
const linked = (await db.query("select fingerprint from public.nba_observations where game_id=$1 order by fingerprint", [before])).rows.map((r) => r.fingerprint);
assert.deepEqual(linked, ['new-quote', 'old-quote'], 'old and new quotes stay on the same game');

// Ordinary updates by id still work, and the move is idempotent.
await ingest({ provider: 'ESPN NBA', games: [{ ...reissued, status: 'STATUS_FINAL', away_score: 101, home_score: 99 }] });
const done = (await db.query("select provider_id, status, away_score from public.nba_games where id=$1", [before])).rows[0];
assert.deepEqual(done, { provider_id: '401819999', status: 'STATUS_FINAL', away_score: 101 });

// A different game never takes another game's row: the new id already stored means no move.
await ingest({ provider: 'ESPN NBA', games: [game({ provider_id: '401810002', slug: 'lac-bos-20261020' })] }).catch(() => {});
assert.equal((await db.query("select provider_id from public.nba_games where id=$1", [before])).rows[0].provider_id, '401819999');

for (const role of ['anon', 'authenticated'])
  assert.equal((await db.query("select has_function_privilege($1,'private.ingest_nba(jsonb)','execute') p", [role])).rows[0].p, false);
console.log('PASS ESPN re-issued game ids move the stored game instead of failing the NBA feed');
await db.close();
