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
await db.exec(readFileSync('supabase/migrations/20261018060000_nba_source_feed.sql', 'utf8'));
await db.exec(readFileSync('supabase/migrations/20261018070000_nba_results.sql', 'utf8'));
await db.query(`select public.ingest_nba($1)`, [{ provider: 'ESPN NBA', games: [{ provider_id: '401898407', slug: 'bos-phi-20261016',
  away_team: 'Boston Celtics', home_team: 'Philadelphia 76ers', tipoff: new Date(Date.now() - 6 * 3600000).toISOString(),
  source: 'https://www.espn.com/nba/game/_/gameId/401898407' }] }]);
const gameId = (await db.query('select id from public.nba_games')).rows[0].id;

// Five players a side; Boston 102-100 after overtime.
const line = (id, player, side, points, over = {}) => ({ athlete_id: id, player, side, played: true, minutes: 30,
  points, rebounds: 5, assists: 2, threes: 1, steals: 1, blocks: 0, turnovers: 2, ...over });
const players = () => [
  line('1', 'Jayson Tatum', 'away', 30), line('2', 'Jaylen Brown', 'away', 22), line('3', 'Derrick White', 'away', 20),
  line('4', 'Payton Pritchard', 'away', 15), line('5', 'Luka Garza', 'away', 15),
  line('6', 'Tyrese Maxey', 'home', 40), line('7', 'Kelly Oubre Jr.', 'home', 25), line('8', 'Nikola Jović', 'home', 15),
  line('9', 'Andre Drummond', 'home', 10), line('10', 'Quentin Grimes', 'home', 10),
  line('11', 'Taye Fields', 'home', 0, { played: false, minutes: null, rebounds: 0, assists: 0, threes: 0, steals: 0, blocks: 0, turnovers: 0 }),
];
const summary = (over = {}) => ({ provider_id: '401898407', completed: true, status: 'STATUS_FINAL', overtime: true,
  source_url: 'https://www.espn.com/nba/boxscore/_/gameId/401898407', source_hash: 'a'.repeat(64),
  away: { team: 'Boston Celtics', score: 102, rebounds: 25, assists: 10, threes: 5 },
  home: { team: 'Philadelphia 76ers', score: 100, rebounds: 25, assists: 10, threes: 5 }, players: players(), ...over });
const record = async (p) => (await db.query('select public.record_nba_result($1) r', [p])).rows[0].r;
const progress = async () => (await db.query('select status, reason from public.nba_result_progress')).rows[0];
const grade = async (...a) => (await db.query('select public.nba_grade($1,$2,$3,$4,$5) g', [gameId, ...a])).rows[0].g;
const age = (h) => db.exec(`update private.nba_result_staging set first_seen_at = now() - interval '${h} hours'`);

// Not final yet; postponed games are NO_RESULT.
assert.deepEqual(await record({ provider_id: '401898407', completed: false, status: 'STATUS_IN_PROGRESS' }), { status: 'AWAITING_FINAL' });
assert.deepEqual(await record({ provider_id: '401898407', completed: false, status: 'STATUS_POSTPONED' }), { status: 'NO_RESULT' });
assert.equal(await grade('h2h', 'Boston Celtics', null, null), 'PENDING');

// A box score that does not add up is never staged.
const short = summary(); short.away = { ...short.away, score: 103 };
assert.equal((await record(short)).status, 'INCONSISTENT');
assert.match((await progress()).reason, /away player points do not add up/);
const reb = summary(); reb.home = { ...reb.home, rebounds: 24 };
assert.equal((await record(reb)).status, 'INCONSISTENT');
assert.equal((await db.query('select count(*)::int n from private.nba_result_staging')).rows[0].n, 0);

// Caller errors are rejected outright.
await assert.rejects(record(summary({ source_url: 'https://example.com/x' })), /Invalid result evidence/);
await assert.rejects(record(summary({ away: { ...summary().away, team: 'LA Clippers' } })), /Teams do not match/);
await assert.rejects(record(summary({ players: [...players(), line('1', 'Dup', 'away', 0)] })), /Invalid player rows/);
await assert.rejects(record(summary({ provider_id: '1' })), /Unknown NBA game/);

// Consistent final: staged, unchanged reads keep confirming, a changed read restarts the clock,
// and the same fingerprint 3 hours later is recorded.
assert.equal((await record(summary())).status, 'CONFIRMING');
await age(2);
assert.equal((await record(summary())).status, 'CONFIRMING');
await age(4);
const changed = summary(); changed.players[0].steals = 2;
assert.equal((await record(changed)).status, 'CONFIRMING');
assert.match((await progress()).reason, /confirmation restarted/);
assert.equal((await record(changed)).status, 'CONFIRMING');
await age(3);
assert.deepEqual(await record(changed), { status: 'FINAL', recorded: true });
assert.equal((await progress()).status, 'FINAL');
const result = (await db.query('select away_score, home_score, overtime from public.nba_game_results')).rows[0];
assert.deepEqual(result, { away_score: 102, home_score: 100, overtime: true });
assert.equal((await db.query('select count(*)::int n from public.nba_player_results')).rows[0].n, 11);
assert.equal((await db.query(`select name_key from public.nba_player_results where athlete_id='8'`)).rows[0].name_key, 'nikola jovic');
assert.equal((await db.query(`select name_key from public.nba_player_results where athlete_id='7'`)).rows[0].name_key, 'kelly oubre');

// Game lines, overtime included.
assert.equal(await grade('h2h', 'Boston Celtics', null, null), 'WIN');
assert.equal(await grade('h2h', 'Philadelphia 76ers', null, null), 'LOSS');
assert.equal(await grade('spreads', 'Philadelphia 76ers', 2.5, null), 'WIN');
assert.equal(await grade('spreads', 'Boston Celtics', -2, null), 'PUSH');
assert.equal(await grade('spreads', 'Boston Celtics', -2.5, null), 'LOSS');
assert.equal(await grade('totals', 'Over', 201.5, null), 'WIN');
assert.equal(await grade('totals', 'Under', 202, null), 'PUSH');
// Props: name matching ignores accents, punctuation and suffixes; DNP is void; unknown names need review.
assert.equal(await grade('player_points', 'Over', 39.5, 'Tyrese Maxey'), 'WIN');
assert.equal(await grade('player_points', 'Under', 24.5, 'Kelly Oubre Jr'), 'LOSS');
assert.equal(await grade('player_rebounds', 'Over', 5, 'Nikola Jovic'), 'PUSH');
assert.equal(await grade('player_threes', 'Under', 1.5, 'NIKOLA JOVIĆ'), 'WIN');
assert.equal(await grade('player_points_rebounds_assists', 'Over', 36.5, 'Jayson Tatum'), 'WIN');
assert.equal(await grade('player_rebounds_assists', 'Under', 6.5, 'Jaylen Brown'), 'LOSS');
assert.equal(await grade('player_points', 'Over', 0.5, 'Taye Fields'), 'VOID');
assert.equal(await grade('player_points', 'Over', 10.5, 'Joel Embiid'), 'REVIEW');
await assert.rejects(grade('player_blocks', 'Over', 0.5, 'Tyrese Maxey'), /Unsupported NBA market/);
await assert.rejects(grade('spreads', 'Boston', -2, null), /Side must be one of the two teams/);
await assert.rejects(grade('totals', 'Over', null, null), /Line required/);

// A later provider change is journaled once, flags CONFLICT, and the recorded result stays.
assert.equal((await record(changed)).status, 'FINAL');
const corrected = summary(); corrected.players[5].points = 41; corrected.players[9].points = 9;
assert.equal((await record(corrected)).status, 'CONFLICT');
assert.equal((await record(corrected)).status, 'CONFLICT');
assert.equal((await db.query('select count(*)::int n from private.nba_result_corrections')).rows[0].n, 1);
assert.equal((await db.query(`select points from public.nba_player_results where athlete_id='6'`)).rows[0].points, 40);
assert.equal(await grade('player_points', 'Over', 39.5, 'Tyrese Maxey'), 'REVIEW');

// Records are immutable; writes are service-only; reads and grading are public.
await assert.rejects(db.exec(`update public.nba_player_results set points = 0`), /immutable/);
await assert.rejects(db.exec(`delete from public.nba_game_results`), /immutable/);
await assert.rejects(db.exec(`update private.nba_result_corrections set source_hash = 'x'`), /immutable/);
const grants = (await db.query(`select has_function_privilege('authenticated','public.record_nba_result(jsonb)','execute') a,
 has_function_privilege('service_role','public.record_nba_result(jsonb)','execute') s,
 has_function_privilege('anon','public.nba_grade(uuid,text,text,numeric,text)','execute') g,
 has_table_privilege('anon','public.nba_player_results','select') r, has_table_privilege('anon','public.nba_player_results','insert') w,
 has_table_privilege('service_role','private.nba_result_staging','select') st`)).rows[0];
assert.deepEqual(grants, { a: false, s: true, g: true, r: true, w: false, st: false });
assert.match((await db.query(`select command from cron.job where jobname='nba-results-refresh'`)).rows[0].command, /functions\/v1\/nba-results/);
console.log('nba results ok');
