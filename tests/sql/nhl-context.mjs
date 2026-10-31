import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
const db = new PGlite(),
  frank = "00000000-0000-4000-8000-000000000001",
  member = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to authenticated,service_role;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.has_membership()returns boolean language sql as $$select current_setting('app.member',true)='yes'$$;
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
create table public.sports_games(id uuid primary key,sport text,start_time timestamptz,payload jsonb);
create table private.frank_anniversary_config(singleton boolean,target_user_id uuid);insert into private.frank_anniversary_config values(true,'${frank}');
create table public.ruby_contributors(user_id uuid,brand text,active boolean);insert into public.ruby_contributors values('${frank}','FranksCorner',true);
create table private.frank_nhl_feedback(user_id uuid,answers jsonb,created_at timestamptz,request_id uuid);
insert into private.frank_nhl_feedback values('${frank}','{"players":"Fixture Favorite"}',now(),gen_random_uuid());
insert into public.sports_games select ('00000000-0000-4000-8000-00000000000'||n)::uuid,'nhl',now()+interval '2 hours',jsonb_build_object('away',jsonb_build_object('abbreviation','PIT'),'home',jsonb_build_object('abbreviation','MTL'),'completed',false,'status','STATUS_SCHEDULED') from generate_series(3,5)n;
insert into public.sports_games values('00000000-0000-4000-8000-000000000006','ncaab',now()+interval '2 hours','{}');`);
await db.exec(
  readFileSync(
    "supabase/migrations/20261031213617_nhl_expanded_context.sql",
    "utf8",
  ),
);
await db.exec("set role anon");
await assert.rejects(
  db.query("select public.nhl_game_context($1)", [member]),
  /permission denied/,
);
await db.exec("reset role");
await db.exec(
  `set role authenticated;set app.uid='${member}';set app.member='yes';set app.age='yes'`,
);
for (const fn of [
  "nhl_context_work()",
  "nhl_context_source('https://api-web.nhle.com/v1/roster/PIT/20262027')",
])
  await assert.rejects(db.query("select public." + fn), /permission denied/);
await assert.rejects(
  db.query("select * from private.nhl_context_reports"),
  /permission denied/,
);
assert.equal(
  (
    await db.query(
      "select public.nhl_game_context('00000000-0000-4000-8000-000000000003') r",
    )
  ).rows[0].r.state,
  "waiting",
);
await db.exec("reset role;set role service_role");
const url = "https://api-web.nhle.com/v1/roster/PIT/20262027",
  body = '{"fixture":true}';
const cached = (
  await db.query("select public.nhl_context_source($1,$2,900) r", [url, body])
).rows[0].r;
assert.equal(cached.sha256, createHash("sha256").update(body).digest("hex"));
await assert.rejects(
  db.query(
    "select public.nhl_context_source('https://evil.invalid/private','bad')",
  ),
  /Unsupported/,
);
const work = (await db.query("select public.nhl_context_work() r")).rows[0].r;
assert.equal(work.games.length, 2);
const next = (await db.query("select public.nhl_context_work() r")).rows[0].r;
assert.equal(next.games.length, 1);
const id = work.games[0].id;
await db.exec("reset role");
const at = (
  await db.query("select start_time from public.sports_games where id=$1", [id])
).rows[0].start_time.toISOString();
await db.exec("set role service_role");
const report = {
  version: 1,
  game_id: id,
  cutoff: at,
  teams: [{ abbreviation: "PIT" }, { abbreviation: "MTL" }],
  sources: [{ url }],
};
await assert.rejects(
  db.query("select public.nhl_context_finish($1,$2)", [
    id,
    { ...report, version: null },
  ]),
  /binding/,
);
await assert.rejects(
  db.query("select public.nhl_context_finish($1,$2)", [
    id,
    { ...report, teams: [{ abbreviation: "TOR" }, { abbreviation: "VAN" }] },
  ]),
  /teams/,
);
await db.query("select public.nhl_context_finish($1,$2)", [id, report]);
await db.exec("reset role;set role authenticated");
let r = (await db.query("select public.nhl_game_context($1) r", [id])).rows[0]
  .r;
assert.equal(r.state, "ready");
assert.equal(r.watchlist, null);
await db.exec(`set app.uid='${frank}'`);
r = (await db.query("select public.nhl_game_context($1) r", [id])).rows[0].r;
assert.equal(r.watchlist, "Fixture Favorite");
await db.exec("set app.age='no'");
assert.equal(
  (await db.query("select public.nhl_game_context($1) r", [id])).rows[0].r
    .state,
  "denied",
);
await db.exec("set app.age='yes';set app.member='no'");
assert.equal(
  (await db.query("select public.nhl_game_context($1) r", [id])).rows[0].r
    .state,
  "denied",
);
await db.exec(
  `reset role;update public.sports_games set start_time=start_time+interval '1 hour' where id='${id}';set role authenticated;set app.member='yes'`,
);
assert.equal(
  (await db.query("select public.nhl_game_context($1) r", [id])).rows[0].r
    .state,
  "waiting",
);
await db.close();
console.log(
  "PASS NHL source role grants/checksum/allowlist, bounded leases, report binding, private watchlist and age/member gates",
);
