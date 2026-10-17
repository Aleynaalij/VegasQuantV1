import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
// Stubs for pg_cron, pg_net and Vault: the test checks when the dispatcher calls GitHub.
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema cron; create schema net; create schema vault;
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(n text,s text,c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) returning 1 $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
create table net._http_response(id bigint primary key, status_code int, error_msg text);
create function net.http_post(url text, body jsonb, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
 returns bigint language sql as $$ insert into net.calls(url,body,headers) values(url,body,headers) returning id $$;
create table vault.decrypted_secrets(name text, decrypted_secret text);
create table public.source_observations(id serial, kind text, payload jsonb, recorded_at timestamptz);
`);
const migration = readFileSync('supabase/migrations/20261018030000_model_scan_dispatch.sql', 'utf8');
await db.exec(migration);
await db.exec(migration); // reruns cleanly and keeps a single job
await db.exec(readFileSync('supabase/migrations/20261018050000_model_scan_retry.sql', 'utf8'));
const calls = async () => (await db.query('select count(*)::int n from net.calls')).rows[0].n;
const tick = () => db.exec('select private.dispatch_model_scan()');
const prop = (book, market, ago) => db.query(
 `insert into public.source_observations(kind,payload,recorded_at) values('odds',$1,now()-$2::interval)`,
 [{ book, market }, ago]);

assert.deepEqual((await db.query("select schedule from cron.job where jobname='model-scan-dispatch'")).rows, [{ schedule: '*/5 * * * *' }]);
// A fresh FanDuel prop batch without the token: nothing is sent and nothing is marked dispatched.
await prop('FanDuel', 'player_rush_yds', '2 minutes');
await tick();
assert.equal(await calls(), 0);
await db.exec("insert into vault.decrypted_secrets values('github_research_board_token','tok')");
await tick();
assert.equal(await calls(), 1);
const call = (await db.query('select * from net.calls')).rows[0];
assert.match(call.url, /actions\/workflows\/model-scan\.yml\/dispatches$/);
assert.deepEqual(call.body, { ref: 'main' });
assert.equal(call.headers.Authorization, 'Bearer tok');
// The same batch (rows written a minute later included) dispatches once while GitHub has not answered.
await prop('FanDuel', 'player_reception_yds_alternate', '1 minute');
await tick();
assert.equal(await calls(), 1);
const answer = (status) => db.query('insert into net._http_response values((select max(id) from net.calls),$1,null)', [status]);
// GitHub rejected it: the batch is re-sent, at most three attempts in all.
await answer(401); await tick(); assert.equal(await calls(), 2);
await answer(502); await tick(); assert.equal(await calls(), 3);
await answer(500); await tick(); assert.equal(await calls(), 3);
// With attempts left, a timeout (no status) is retried and an accepted dispatch ends the batch.
await db.exec(`update private.workflow_dispatches set attempts=1`);
await tick(); assert.equal(await calls(), 4);
await answer(null); await tick(); assert.equal(await calls(), 5);
await answer(204); await tick(); assert.equal(await calls(), 5);
assert.equal((await db.query(`select attempts from private.workflow_dispatches`)).rows[0].attempts, 3);
// Retries follow the stored batch after its rows leave the 10-minute lookup, until it is 15 minutes old.
await db.exec(`update public.source_observations set recorded_at=recorded_at-interval '11 minutes';
 update private.workflow_dispatches set last_source_at=last_source_at-interval '11 minutes', attempts=1, request_id=999;
 insert into net._http_response values(999,503,null)`);
await tick(); assert.equal(await calls(), 6);
await answer(500);
await db.exec(`update private.workflow_dispatches set last_source_at=last_source_at-interval '5 minutes'`);
await tick(); assert.equal(await calls(), 6);
// Other books, other markets and old batches never dispatch.
await db.exec('delete from public.source_observations');
await prop('DraftKings', 'player_rush_yds', '0 minutes');
await prop('FanDuel', 'h2h', '0 minutes');
await prop('FanDuel', 'player_rush_yds', '20 minutes');
await tick();
assert.equal(await calls(), 6);
// The next batch dispatches again with a fresh attempt count.
await db.exec(`update private.workflow_dispatches set last_source_at=last_source_at-interval '6 hours'`);
await prop('FanDuel', 'player_rush_yds', '0 minutes');
await tick();
assert.equal(await calls(), 7);
assert.equal((await db.query(`select attempts from private.workflow_dispatches`)).rows[0].attempts, 1);
// Members and the service role cannot call it.
const grants = (await db.query(`select has_function_privilege('service_role','private.dispatch_model_scan()','execute') s,
 has_function_privilege('authenticated','private.dispatch_model_scan()','execute') a`)).rows[0];
assert.deepEqual(grants, { s: false, a: false });
console.log('model scan dispatch ok');
