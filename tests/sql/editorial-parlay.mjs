import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role authenticated;create role anon;create schema private;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table candidate_releases(id uuid,candidates jsonb);create table research_leg_results(leg_key text primary key,result text,source_url text);
create view published_legs with(security_invoker=true)as select CASE WHEN (c.value ->> 'fun_play'::text) = 'true'::text THEN 'HAIL_MARY'::text ELSE 'SINGLE'::text END kind from candidate_releases r cross join lateral jsonb_array_elements(r.candidates)c(value);
`);
await db.exec(fs.readFileSync(new URL("../../supabase/migrations/20261014183212_editorial_parlay_tracking.sql", import.meta.url), "utf8"));
const id = "00000000-0000-4000-8000-000000000001",
  key = "candidate:" + id + ":1";
await db.query("insert into candidate_releases values($1,$2::jsonb)", [
  id,
  JSON.stringify([{ parlay: true, leg_keys: ["a", "b"] }]),
]);
assert.equal(
  (await db.query("select kind from published_legs")).rows[0].kind,
  "PARLAY",
);
await db.exec(
  "insert into research_leg_results values('a','WIN','https://example.com/a')",
);
assert.equal(
  (await db.query("select count(*)::int n from research_leg_results")).rows[0]
    .n,
  1,
);
await db.exec(
  "insert into research_leg_results values('b','WIN','https://example.com/b')",
);
assert.equal(
  (
    await db.query("select result from research_leg_results where leg_key=$1", [
      key,
    ])
  ).rows[0].result,
  "WIN",
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from private.editorial_parlay_results",
    )
  ).rows[0].n,
  1,
);
const id2 = "00000000-0000-4000-8000-000000000002";
await db.query("insert into candidate_releases values($1,$2::jsonb)", [
  id2,
  JSON.stringify([{ parlay: true, leg_keys: ["c", "d"] }]),
]);
await db.exec(
  "insert into research_leg_results values('c','LOSS','https://example.com/c')",
);
assert.equal(
  (
    await db.query("select result from research_leg_results where leg_key=$1", [
      "candidate:" + id2 + ":1",
    ])
  ).rows[0].result,
  "LOSS",
);
const id3 = "00000000-0000-4000-8000-000000000003";
await db.query("insert into candidate_releases values($1,$2::jsonb)", [
  id3,
  JSON.stringify([{ parlay: true, leg_keys: ["e", "f"] }]),
]);
await db.exec(
  "insert into research_leg_results values('e','WIN','https://example.com/e'),('f','VOID','https://example.com/f')",
);
assert.equal(
  (
    await db.query(
      "select count(*)::int n from research_leg_results where leg_key=$1",
      ["candidate:" + id3 + ":1"],
    )
  ).rows[0].n,
  0,
);
await db.close();
console.log(
  "Parlay results: one ticket key, all-win derived result, any-loss fails, pushes/voids never fabricate a payout.",
);
