import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
// NBA paused: the NBA feeds run once each morning (6:00/6:05 ET, a 9:10 ET confirming results read) and the
// shadow scan dispatcher is gone.
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema cron; create schema vault; create schema net;
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(n text,s text,c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) returning 1 $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
create table vault.decrypted_secrets(name text, decrypted_secret text);
insert into vault.decrypted_secrets values('vq_source_sync_token', 'test-token');
create table net.calls(id bigserial primary key, url text, headers jsonb, body jsonb, timeout int);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint language sql as
 $$ insert into net.calls(url, headers, body, timeout) values(url, headers, body, timeout_milliseconds) returning id $$;
insert into cron.job values('nba-source-refresh', '2,17,32,47 * * * *', 'x'), ('nba-results-refresh', '9,39 * * * *', 'x'),
 ('nba-shadow-scan-dispatch', '*/5 * * * *', 'x'), ('model-scan-dispatch', '*/5 * * * *', 'x');
`);
await db.exec(readFileSync('supabase/migrations/20261022010000_nba_daily_collection.sql', 'utf8').replace(/create extension[^;]*;/g, ''));
const jobs = Object.fromEntries((await db.query('select jobname, schedule, command from cron.job')).rows.map((r) => [r.jobname, r]));
assert.deepEqual(Object.keys(jobs).sort(), ['model-scan-dispatch', 'nba-results-confirm', 'nba-results-refresh', 'nba-source-refresh']);
assert.equal(jobs['nba-source-refresh'].schedule, '0 10,11 * * *');
assert.match(jobs['nba-source-refresh'].command, /nba_daily_post\('nba-sync', 6\)/);
assert.equal(jobs['nba-results-refresh'].schedule, '5 10,11 * * *');
assert.match(jobs['nba-results-refresh'].command, /nba_daily_post\('nba-results', 6\)/);
assert.equal(jobs['nba-results-confirm'].schedule, '10 13,14 * * *');
assert.match(jobs['nba-results-confirm'].command, /nba_daily_post\('nba-results', 9\)/);
assert.equal(jobs['model-scan-dispatch'].schedule, '*/5 * * * *'); // NFL untouched

// Runs only in its New York hour, so the EDT and EST slots never both fire.
const hour = (await db.query(`select extract(hour from now() at time zone 'America/New_York')::int h`)).rows[0].h;
await db.query('select private.nba_daily_post($1, $2)', ['nba-sync', (hour + 1) % 24]);
assert.equal((await db.query('select count(*)::int n from net.calls')).rows[0].n, 0);
await db.query('select private.nba_daily_post($1, $2)', ['nba-results', hour]);
const [call] = (await db.query('select url, headers, timeout from net.calls')).rows;
assert.equal(call.url, 'https://uowearboulykfcwnuirn.supabase.co/functions/v1/nba-results');
assert.equal(call.headers.Authorization, 'Bearer test-token');
assert.equal(call.timeout, 120000);
await assert.rejects(db.query('select private.nba_daily_post($1, $2)', ['source-sync', hour]), /Unknown NBA function/);
assert.equal((await db.query(`select has_function_privilege('service_role','private.nba_daily_post(text,int)','execute') s`)).rows[0].s, false);
console.log('NBA daily collection: ok');
