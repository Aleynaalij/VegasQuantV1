import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create table public.nba_editorial_picks(id int primary key,game_id int,market text,direction text,line numeric,player text,supersedes_id int);
create table public.nba_games(id int,status text);insert into public.nba_games values(1,'STATUS_FINAL'),(2,'STATUS_FINAL'),(3,'STATUS_FINAL'),(4,'STATUS_FINAL'),(5,'STATUS_IN_PROGRESS'),(6,'STATUS_SUSPENDED');
create table public.nba_result_progress(game_id int,status text);
create table private.fixture_grades(game_id int,grade text);
create function public.nba_grade(int,text,text,numeric,text)returns text language sql security definer as $$select grade from private.fixture_grades where game_id=$1$$;
insert into public.nba_editorial_picks values(1,1,'player_points','Under',20.5,'Sample',null),(2,1,'player_points','Over',20.5,'Sample',1),(3,2,'player_points','Over',20.5,'Other',null),(4,3,'player_points','Over',20,'Push',null),(5,4,'player_points','Over',20.5,'DNP',null),(6,5,'player_points','Over',20.5,'Pending',null),(7,6,'player_points','Over',20.5,'Retracted',null);
insert into public.nba_result_progress values(1,'FINAL'),(2,'CONFLICT'),(3,'FINAL'),(4,'FINAL'),(5,'CONFIRMING'),(6,'FINAL');
insert into private.fixture_grades values(1,'WIN'),(2,'WIN'),(3,'PUSH'),(4,'VOID'),(5,'WIN'),(6,'WIN');
alter table public.nba_editorial_picks enable row level security;
grant select on public.nba_editorial_picks,public.nba_result_progress,public.nba_games to anon,authenticated;
create policy member_read on public.nba_editorial_picks for select to anon,authenticated using(current_setting('test.member',true)='yes');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261031183000_nba_editorial_records.sql",
    "utf8",
  ),
);
const read = async () =>
  (await db.query("select public.nba_editorial_records() r")).rows[0].r;
assert.equal(
  (
    await db.query(
      "select prosecdef from pg_proc where oid='public.nba_editorial_records()'::regprocedure",
    )
  ).rows[0].prosecdef,
  false,
);
await db.exec("set role anon");
assert.equal((await read()).selections, 0);
await db.exec("reset role;set test.member='yes';set role authenticated");
assert.deepEqual(await read(), {
  selections: 6,
  win: 1,
  loss: 0,
  push: 1,
  void: 1,
  pending: 3,
  review: 1,
});
await db.exec(
  "reset role;update public.nba_result_progress set status='FINAL' where game_id=2;set role authenticated",
);
const finalized = await read();
assert.equal(finalized.win, 2);
assert.equal(finalized.pending, 2);
assert.equal(finalized.review, 0);
console.log(
  "PASS NBA records: RLS, current revisions only, existing grade, conflict/confirmation pending, push/void and derived updates",
);
await db.close();
