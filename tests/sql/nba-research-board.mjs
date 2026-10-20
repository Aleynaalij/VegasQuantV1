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
for (const m of ['20261018060000_nba_source_feed', '20261018070000_nba_results', '20261020010000_nba_research_board'])
  await db.exec(readFileSync(`supabase/migrations/${m}.sql`, 'utf8'));
const hours = (h) => new Date(Date.now() + h * 3600000).toISOString();
const game = (id, tip, extra = {}) => ({ provider_id: id, slug: `g-${id}`, away_team: 'Philadelphia 76ers', home_team: 'New York Knicks', tipoff: tip,
  season_type: 2, source: `https://www.espn.com/nba/game/_/gameId/${id}`, ...extra });
const over = (player, point, price) => ({ name: 'Over', description: player, point, price });
const prop = (id, fp, outs, market = 'player_rebounds', book = 'DraftKings') => ({ provider_id: id, kind: 'prop',
  source: 'https://api.the-odds-api.com/v4/sports/basketball_nba/events/e/odds', observed_at: new Date(Date.now() - 60000).toISOString(),
  fingerprint: fp, payload: { book, market, outcomes: outs } });
await db.query('select public.ingest_nba($1)', [{ provider: 'The Odds API NBA', games: [game('1', hours(10)), game('2', hours(10), { season_type: 1 })] }]);
await db.query('select public.ingest_nba($1)', [{ provider: 'The Odds API NBA props', observations: [
  prop('1', 'a', [over('VJ Edgecombe', 4.5, -170)]), prop('2', 'p', [over('VJ Edgecombe', 4.5, -152)])] }]);
await db.query('select public.ingest_nba($1)', [{ provider: 'The Odds API NBA props', observations: [prop('1', 'b', [over('VJ Edgecombe', 4.5, -152), over('OG Anunoby', 4.5, -157)])] }]);
const obs = async (fp) => (await db.query('select id from public.nba_observations where fingerprint=$1', [fp])).rows[0].id;
const history = (vals) => vals.map((value, i) => ({ value, date: `2026-04-0${i + 1}`, source_url: 'https://www.espn.com/nba/boxscore' }));
const leg = async (over = {}) => ({ observation_id: await obs('b'), player: 'VJ Edgecombe', market: 'player_rebounds', line: 4.5, book: 'DraftKings',
  odds: -152, history: history([6, 8, 6, 9, 7]), why: 'Cleared 5 of 5.', risk: 'Research only.', sources: [{ url: 'https://www.espn.com' }], ...over });
const publish = async (p) => (await db.query('select private.publish_nba_research_leg($1) id', [p])).rows[0].id;

// R7: the first stored quote (-170) is 18 cents shorter than -152 (the market moved against the over), so the leg is refused; Anunoby's first quote is -157.
await assert.rejects(publish(await leg()), /15\+ cents against/);
const id = await publish(await leg({ player: 'OG Anunoby', odds: -157, history: history([13, 8, 5, 4, 5]) }));
const row = (await db.query('select cleared, sample, median, break_even, edge_points, expires_at from public.nba_research_legs where id=$1', [id])).rows[0];
assert.deepEqual([row.cleared, row.sample, Number(row.median), Number(row.break_even), Number(row.edge_points)], [4, 5, 5, 61.1, 18.9]);

// Gate failures: price must match, sit in -150..-249, beat break-even by 5 with a median over the line, and be a regular-season game.
const anunoby = (o) => leg({ player: 'OG Anunoby', odds: -157, history: history([13, 8, 5, 4, 5]), ...o });
await assert.rejects(publish(await anunoby({ odds: -160 })), /does not match|outside/);
await assert.rejects(publish(await anunoby({ line: 5.5 })), /does not match/);
await assert.rejects(publish(await anunoby({ history: history([5, 5, 4, 4, 6]) })), /break-even/);
await assert.rejects(publish(await anunoby({ history: history([13, 8, 5]) })), /five games/);
await assert.rejects(publish(await anunoby({ market: 'player_points' })), /does not match/);
await assert.rejects(publish(await leg({ observation_id: await obs('p'), player: 'VJ Edgecombe' })), /regular-season/);
await assert.rejects(publish(await anunoby()), /duplicate|unique/); // one leg per game, player and market

// Records are immutable, member-readable, and graded by nba_grade.
await assert.rejects(db.exec(`update public.nba_research_legs set odds = -200`), /immutable/);
assert.equal((await db.query(`select result from public.nba_research_results where id=$1`, [id])).rows[0].result, 'PENDING');
const g = (await db.query(`select has_function_privilege('authenticated','private.publish_nba_research_leg(jsonb)','execute') a,
 has_function_privilege('service_role','private.publish_nba_research_leg(jsonb)','execute') s,
 has_table_privilege('authenticated','public.nba_research_legs','insert') i, has_table_privilege('anon','public.nba_research_results','select') r`)).rows[0];
assert.deepEqual(g, { a: false, s: true, i: false, r: true });
console.log('nba research board ok');
