import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
// Stubs for pg_cron, pg_net and Vault: the test checks when the dispatcher asks GitHub to run the teaser.
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema cron; create schema net; create schema vault;
create table cron.job(jobname text primary key, schedule text, command text);
create function cron.schedule(n text,s text,c text) returns bigint language sql as $$ insert into cron.job values(n,s,c) returning 1 $$;
create function cron.unschedule(n text) returns boolean language sql as $$ delete from cron.job where jobname=n returning true $$;
create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
 returns bigint language sql as $$ insert into net.calls(url,body,headers) values(url,body,headers) returning id $$;
create table vault.decrypted_secrets(name text, decrypted_secret text);
create table public.nba_games(id serial, season_type int, tipoff timestamptz);
`);
const migration = readFileSync(
  "supabase/migrations/20261127200000_nba_teaser_timer.sql",
  "utf8",
);
await db.exec(migration);
await db.exec(migration); // re-runnable: unschedules before scheduling
const jobs = (
  await db.query("select * from cron.job where jobname='nba-teaser-dispatch'")
).rows;
assert.equal(jobs.length, 1);
assert.equal(jobs[0].schedule, "13,33,53 * * * *");
assert.equal(jobs[0].command, "select private.dispatch_nba_teaser()");

const dispatch = () => db.exec("select private.dispatch_nba_teaser()");
const calls = async () =>
  (await db.query("select url, body, headers from net.calls order by id")).rows;

// No token yet: nothing is sent even on a game day.
await db.exec(
  "insert into public.nba_games(season_type,tipoff) values(2, now()+interval '5 hours')",
);
await dispatch();
assert.equal((await calls()).length, 0);

await db.exec(
  "insert into vault.decrypted_secrets values('github_research_board_token','SYNTHETIC-NOT-A-CREDENTIAL')",
);
await dispatch();
const [call] = await calls();
assert.equal(
  call.url,
  "https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/nba-prop-teaser.yml/dispatches",
);
assert.deepEqual(call.body, { ref: "main" });
assert.equal(call.headers.Authorization, "Bearer SYNTHETIC-NOT-A-CREDENTIAL");

// Off days: only finished games, a game beyond 36 hours, or non-regular-season games -> no run.
await db.exec("delete from net.calls; delete from public.nba_games");
await db.exec(`insert into public.nba_games(season_type,tipoff) values
 (2, now()-interval '3 hours'), (2, now()+interval '40 hours'), (1, now()+interval '2 hours')`);
await dispatch();
assert.equal((await calls()).length, 0);

for (const role of ["anon", "authenticated", "service_role"])
  assert.equal(
    (
      await db.query(
        "select has_function_privilege($1,'private.dispatch_nba_teaser()','execute') p",
        [role],
      )
    ).rows[0].p,
    false,
  );
console.log("PASS teaser dispatch: game days only, token-gated, private");
await db.close();
