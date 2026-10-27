import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const g = "00000000-0000-4000-8000-000000000001",
  r = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role authenticated;create role anon;create role service_role bypassrls;create schema private;
create function private.age_member_allowed()returns boolean language sql as $$select true$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table published_legs(leg_key text,release_id uuid,leg_index integer,name text,market text,matchup text,game_id uuid,result text,result_source text,published_at timestamptz);
create table candidate_releases(id uuid,candidates jsonb);
create table private.leg_result_contracts(leg_key text,game_id uuid,metric text,threshold numeric,operator text,period text);
create table private.leg_result_evidence(leg_key text,value numeric);
create table leg_result_progress(leg_key text,status text);
create table games(id uuid,kickoff timestamptz);
insert into games values('${g}','2026-10-12T23:00:00Z');
insert into candidate_releases values('${r}','[{"analysis_kind":"QUALITATIVE_EDITORIAL"},{"analysis_kind":"QUALITATIVE_EDITORIAL"},{"analysis_kind":"QUALITATIVE_EDITORIAL"},{"analysis_kind":"RETROSPECTIVE_OWNER_TICKET"},{"analysis_kind":"QUALITATIVE_EDITORIAL"},{"analysis_kind":"QUALITATIVE_EDITORIAL"},{"analysis_kind":"QUALITATIVE_EDITORIAL"}]');
insert into published_legs values
('a','${r}',1,'Player','Full game · 50+ receiving yards','A @ B','${g}','WIN','https://example.com','2026-10-11T12:00:00Z'),
('b','${r}',2,'Player','Full game · 50+ receiving yards','A @ B','${g}','WIN','https://example.com','2026-10-11T13:00:00Z'),
('c','${r}',3,'Other','Full game · 20+ receiving yards','A @ B','${g}','LOSS','https://example.com','2026-10-11T12:00:00Z'),
('d','${r}',4,'Ticket','WON','A @ B','${g}','WIN','https://example.com','2026-10-11T12:00:00Z'),
('e','${r}',5,'Unknown','Full game · 20+ receiving yards','Unknown',null,null,null,'2026-10-11T12:00:00Z'),
('f','${r}',6,'Push','Full game · Over 50 receiving yards','A @ B','${g}','PUSH','https://example.com','2026-10-11T12:00:00Z'),
('h','${r}',7,'Unsourced','Full game · 20+ receiving yards','A @ B','${g}','WIN',null,'2026-10-11T12:00:00Z');
`);
await db.exec(fs.readFileSync("/tmp/vq-weekly.sql", "utf8"));
const publish = () =>
  db.query("select publish_weekly_performance('2026-10-13') as r");
assert.equal((await publish()).rows[0].r.inserted, true);
assert.equal((await publish()).rows[0].r.inserted, false);
const p = (await db.query("select payload from weekly_performance_reports"))
  .rows[0].payload;
assert.equal(p.wins, 1);
assert.equal(p.losses, 1);
assert.equal(p.pushes, 1);
assert.equal(p.pending, 1);
assert.equal(p.unresolved_publications, 1);
assert.equal(p.excluded_publications, 1);
assert.equal(p.duplicates_removed, 1);
await db.exec("insert into leg_result_progress values('a','CONFLICT')");
assert.equal((await publish()).rows[0].r.version, 2);
assert.equal(
  (await db.query("select count(*)::int n from weekly_performance_reports"))
    .rows[0].n,
  2,
);
await assert.rejects(
  db.query("select publish_weekly_performance('2026-10-14')"),
);
await db.exec("set role authenticated");
await assert.rejects(publish());
await db.exec("reset role");
await assert.rejects(db.exec("delete from weekly_performance_reports"));
await db.close();
console.log(
  "Weekly reports: duplicates removed, source-only outcomes, pushes separated, gaps counted, dedupe/version history, unauthorized writes denied.",
);
