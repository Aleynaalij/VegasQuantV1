import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.has_membership()returns boolean language sql as $$select current_setting('app.member',true)='yes'$$;
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
create table public.sports_games(id uuid primary key,sport text,start_time timestamptz,payload jsonb,updated_at timestamptz default now());
create table public.sports_markets(id uuid primary key,game_id uuid,observed_at timestamptz,payload jsonb);
create table public.sports_selections(id uuid,game_id uuid,market_id uuid,author_id uuid,title text);
insert into public.sports_games values('00000000-0000-4000-8000-000000000001','ncaab',now()+interval '8 hours','{"status":"STATUS_SCHEDULED","completed":false}',now()),('00000000-0000-4000-8000-000000000002','nhl',now()+interval '9 hours','{"status":"STATUS_SCHEDULED","completed":false}',now());
insert into public.sports_markets values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001',now()-interval '3 hours','{"market":"h2h","odds":-120}'),('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001',now()-interval '2 hours','{"market":"h2h","odds":-130,"expires_at":"2020-01-01T00:00:00Z"}');
insert into public.sports_selections values('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000099','Fixture pick');
`);
for (const t of ["sports_games", "sports_markets", "sports_selections"]) {
  await db.exec(`alter table public.${t} enable row level security;grant select on public.${t} to anon,authenticated;
 create policy readable on public.${t} for select to anon,authenticated using(${t === "sports_games" ? "true" : "(select private.has_membership())"});
 create policy age_gate on public.${t} as restrictive for select to authenticated using((select private.age_member_allowed()));`);
}
// No facts or result table exists: this lightweight read cannot query either one.
await db.exec(
  readFileSync(
    "supabase/migrations/20261031175232_sports_home_lightweight.sql",
    "utf8",
  ),
);
const read = async (sport = "ncaab") =>
  (await db.query("select public.sports_home($1,7) r", [sport])).rows[0].r;
assert.equal(
  (
    await db.query(
      "select prosecdef from pg_proc where oid='public.sports_home(text,integer)'::regprocedure",
    )
  ).rows[0].prosecdef,
  false,
);
await db.exec("set role anon");
let p = await read();
assert.equal(p.games.length, 1);
assert.equal(p.markets.length, 0);
assert.equal(p.selections.length, 0);
await db.exec(
  "reset role;set app.member='yes';set app.age='yes';set app.uid='00000000-0000-4000-8000-000000000099';set role authenticated",
);
p = await read();
assert.equal(p.access, true);
assert.equal(p.markets.length, 1);
assert.equal(p.markets[0].odds, -130);
assert.equal(p.selections[0].market.odds, -120);
assert.equal("author_id" in p.selections[0], false);
assert.deepEqual(p.facts, []);
assert.deepEqual(p.results, []);
assert.equal((await read("nhl")).games.length, 1);
await db.exec("reset role;set app.age='no';set role authenticated");
p = await read();
assert.equal(p.access, false);
assert.equal(p.games.length, 0);
assert.equal(p.markets.length, 0);
await db.exec(
  "reset role;set app.age='yes';set app.member='no';set role authenticated",
);
p = await read();
assert.equal(p.games.length, 1);
assert.equal(p.markets.length, 0);
await db.exec(
  "reset role;set app.member='yes';update public.sports_games set payload=payload||'{\"status\":\"STATUS_POSTPONED\"}'::jsonb where sport='ncaab';set role authenticated",
);
p = await read();
assert.equal(p.markets.length, 0);
assert.equal(p.selections.length, 1);
assert.equal((await read("nba")).games.length, 0);
console.log(
  "PASS sports_home: no facts/results scan, RLS/age, exact newest snapshot, bound original publication, sport and closure guards",
);
await db.close();
