// Minor ESPN corrections after a box score is recorded keep the game FINAL (graded on the recorded
// box score); anything larger goes to CONFLICT. Run: node tests/sql/nba-minor-corrections.mjs
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
await db.query(`select public.ingest_nba($1)`, [{ provider: 'ESPN NBA', games: [{ provider_id: '401898407', slug: 'bos-phi-20261016',
  away_team: 'Boston Celtics', home_team: 'Philadelphia 76ers', tipoff: new Date(Date.now() - 6 * 3600000).toISOString(),
  source: 'https://www.espn.com/nba/game/_/gameId/401898407' }] }]);
const gameId = (await db.query('select id from public.nba_games')).rows[0].id;

const line = (id, player, side, points, over = {}) => ({ athlete_id: id, player, side, played: true, minutes: 30, starter: true, position: 'G',
  points, rebounds: 5, assists: 2, threes: 1, steals: 1, blocks: 0, turnovers: 2, ...over });
const dnp = (id, player) => line(id, player, 'home', 0, { played: false, minutes: null, rebounds: 0, assists: 0, threes: 0, steals: 0, blocks: 0, turnovers: 0, starter: false });
const players = () => [
  line('1', 'Jayson Tatum', 'away', 30), line('2', 'Jaylen Brown', 'away', 22), line('3', 'Derrick White', 'away', 20),
  line('4', 'Payton Pritchard', 'away', 15), line('5', 'Luka Garza', 'away', 15),
  line('6', 'Tyrese Maxey', 'home', 40), line('7', 'Kelly Oubre Jr.', 'home', 25), line('8', 'Nikola Jovic', 'home', 15),
  line('9', 'Andre Drummond', 'home', 10), line('10', 'Quentin Grimes', 'home', 10), dnp('11', 'Taye Fields'),
];
let hash = 0;
const summary = (edit = (ps) => ps, over = {}) => ({ provider_id: '401898407', completed: true, status: 'STATUS_FINAL', overtime: true,
  source_url: 'https://www.espn.com/nba/boxscore/_/gameId/401898407', source_hash: String(++hash).padStart(64, 'a'),
  away: { team: 'Boston Celtics', score: 102, rebounds: 25, assists: 10, threes: 5 },
  home: { team: 'Philadelphia 76ers', score: 100, rebounds: 25, assists: 10, threes: 5 }, players: edit(players()), ...over });
const set = (id, fields) => (ps) => ps.map((p) => (p.athlete_id === id ? { ...p, ...fields } : p));
const both = (...fs) => (ps) => fs.reduce((a, f) => f(a), ps);
const record = async (p) => (await db.query('select public.record_nba_result($1) r', [p])).rows[0].r;
const status = async () => (await db.query('select status from public.nba_result_progress')).rows[0].status;
const grade = async (...a) => (await db.query('select public.nba_grade($1,$2,$3,$4,$5) g', [gameId, ...a])).rows[0].g;

// Record the game: first read stages it, a read 3 hours later records it.
assert.equal((await record(summary())).status, 'CONFIRMING');
await db.exec(`update private.nba_result_staging set first_seen_at = now() - interval '4 hours'`);
assert.equal((await record(summary())).status, 'FINAL');
assert.equal(await grade('player_rebounds', 'Over', 4.5, 'Jayson Tatum'), 'WIN');

// One rebound moved from Tatum to Brown. Before this migration that is CONFLICT and grading stops.
const oneRebound = both(set('1', { rebounds: 4 }), set('2', { rebounds: 6 }));
assert.equal((await record(summary(oneRebound))).status, 'CONFLICT');
assert.equal(await grade('player_rebounds', 'Over', 4.5, 'Jayson Tatum'), 'REVIEW');

// The migration re-checks games in review against their latest logged revision.
await db.exec(readFileSync('supabase/migrations/20261118010000_nba_minor_corrections.sql', 'utf8'));
assert.equal(await status(), 'FINAL');
// Graded on the recorded box score (Tatum 5 rebounds), not the revision (4).
assert.equal(await grade('player_rebounds', 'Over', 4.5, 'Jayson Tatum'), 'WIN');
assert.equal((await db.query(`select rebounds from public.nba_player_results where athlete_id='1'`)).rows[0].rebounds, 5);

// From now on a minor revision is logged and the game stays FINAL.
const corrections = async () => (await db.query('select count(*)::int n from private.nba_result_corrections')).rows[0].n;
const before = await corrections();
assert.deepEqual(await record(summary(both(set('6', { assists: 4, steals: 3 }), set('7', { assists: 0 })))), { status: 'FINAL', correction: 'minor' });
assert.equal(await corrections(), before + 1);
// A bench player who did not play swapped for another who did not play is minor too.
assert.equal((await record(summary((ps) => [...ps.filter((p) => p.athlete_id !== '11'), dnp('12', 'Jared McCain')]))).status, 'FINAL');

// Larger changes go to review: a changed score, a stat moved by 3, a played flag flip, a revision
// that no longer adds up, a dropped player who played, a new player with stats.
const conflicts = {
  score: summary(set('1', { points: 31 }), { away: { team: 'Boston Celtics', score: 103, rebounds: 25, assists: 10, threes: 5 } }),
  delta3: summary(both(set('1', { rebounds: 2 }), set('2', { rebounds: 8 }))),
  minutes3: summary(set('3', { minutes: 34 })),
  played: summary(set('11', { played: true, minutes: 1 })),
  inconsistent: summary(set('1', { rebounds: 6 })),
  dropped: summary((ps) => ps.filter((p) => p.athlete_id !== '5').map((p) => (p.athlete_id === '4' ? { ...p, points: 30 } : p))),
  added: summary((ps) => [...ps, line('13', 'New Guy', 'away', 0, { rebounds: 1, played: true })], {
    away: { team: 'Boston Celtics', score: 102, rebounds: 26, assists: 12, threes: 6 } }),
};
for (const [name, p] of Object.entries(conflicts)) {
  assert.equal((await record(p)).status, 'CONFLICT', name);
  assert.equal(await grade('player_rebounds', 'Over', 4.5, 'Jayson Tatum'), 'REVIEW', name);
  // ESPN's latest read decides: a minor read afterwards returns the game to FINAL.
  assert.equal((await record(summary(oneRebound))).status, 'FINAL', `${name} then minor`);
}
// The read that matches the recorded box score exactly changes nothing.
assert.equal((await record(summary())).status, 'FINAL');
await assert.rejects(db.exec(`update public.nba_player_results set rebounds = 4 where athlete_id = '1'`), /immutable/);
console.log('nba-minor-corrections: ok');
