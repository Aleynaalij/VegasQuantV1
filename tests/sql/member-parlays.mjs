import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const u = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  game = "00000000-0000-4000-8000-000000000003",
  release = "00000000-0000-4000-8000-000000000004";
await db.exec(`create role anon;create role authenticated;create schema auth;create schema private;grant usage on schema auth,private to authenticated;
create table auth.users(id uuid primary key);insert into auth.users values('${u}'),('${other}');
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.has_membership()returns boolean language sql as $$select coalesce(current_setting('app.member',true),'')='true'$$;
create function private.nfl_gate_number(j jsonb)returns numeric language sql as $$select j::text::numeric$$;
create function private.nfl_gate_time(t text)returns timestamptz language sql as $$select t::timestamptz$$;
create table games(id uuid primary key,sport text,kickoff_tbd boolean,kickoff timestamptz);insert into games values('${game}','NFL',false,now()+interval '2 days');
create table published_legs(leg_key text primary key,release_id uuid,official_pick_id uuid,leg_index integer,game_id uuid,kind text,name text,market text,result text,expires_at timestamptz,published_at timestamptz,quote text);
grant select on games,published_legs to authenticated;
create table private.nfl_selection_gate_decisions(entity_id uuid,entity text,accepted boolean,evidence jsonb,created_at timestamptz default now());
create table private.nfl_selection_model_approvals(model_id text,approved_at timestamptz,validation_url text);
insert into published_legs values('a','${release}',null,1,'${game}','PARLAY','Sample Player','40+ rushing yards',null,now()+interval '2 days',now(),'-200'),('b',null,null,1,'${game}','SINGLE','Other Player','20+ receiving yards',null,now()+interval '2 days',now(),null),('conflict',null,null,1,'${game}','OFFICIAL','Sample Player Over 50.5 rushing yards','Player Prop',null,now()+interval '2 days',now(),null),('closed',null,null,1,'${game}','SINGLE','Closed Player','10+ rushing yards',null,now()-interval '1 second',now(),null),('live',null,null,1,'${game}','SINGLE','Live Player','Halftime 10+ rushing yards',null,now()+interval '2 days',now(),null);
`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261016161204_member_parlay_builder.sql",
    "utf8",
  ),
);
await db.exec(
  `set role authenticated;set app.uid='${u}';set app.member='true';`,
);
const id = (
  await db.query("select create_member_parlay('Mine',array['a','b']) id")
).rows[0].id;
assert.equal(
  (await db.query("select create_member_parlay('Again',array['b','a']) id"))
    .rows[0].id,
  id,
);
assert.equal(
  (await db.query("select count(*) n from member_parlays")).rows[0].n,
  1,
);
for (const keys of [
  ["a", "conflict"],
  ["a", "a"],
  ["a", "missing"],
  ["a", "closed"],
  ["a", "live"],
])
  await assert.rejects(
    db.query("select create_member_parlay('Bad',$1::text[])", [keys]),
  );
await assert.rejects(
  db.query(
    "insert into member_parlays(user_id,title,leg_keys,legs,expires_at) values($1,'Forged',array['x','y'],'[{},{}]',now())",
    [u],
  ),
);
await db.exec(`set app.uid='${other}'`);
assert.equal(
  (await db.query("select count(*) n from member_parlays")).rows[0].n,
  0,
);
assert.equal(
  (await db.query("delete from member_parlays returning id")).rows.length,
  0,
);
await db.exec(`set app.uid='${u}';set app.member='false'`);
await assert.rejects(
  db.query("select create_member_parlay('No access',array['a','b'])"),
);
await db.exec(
  `set app.member='true';reset role;update published_legs set name='Changed later' where leg_key='a';`,
);
assert.equal(
  (await db.query("select legs->0->>'name' name from member_parlays")).rows[0]
    .name,
  "Sample Player",
);
// An accepted historical gate alone cannot create a model badge.
await db.query(
  "insert into private.nfl_selection_gate_decisions values($1,'candidate_releases',true,$2,now())",
  [
    release,
    JSON.stringify([
      {
        odds: -200,
        quote_observed_at: new Date().toISOString(),
        selection_gate: { model_id: "approved", model_probability: 0.72 },
      },
    ]),
  ],
);
await db.exec(`set role authenticated;set app.uid='${u}'`);
assert.equal(
  (await db.query("select private.published_leg_recommendation('a') badge"))
    .rows[0].badge,
  null,
);
await db.exec(
  `reset role;insert into private.nfl_selection_model_approvals values('approved',now()-interval '1 day','https://example.com/validation');set role authenticated;`,
);
assert.ok(
  (await db.query("select private.published_leg_recommendation('a') badge"))
    .rows[0].badge.edge_pp >= 3,
);
await db.exec(
  `reset role;update private.nfl_selection_gate_decisions set evidence=jsonb_set(evidence,'{0,experimental}','true');set role authenticated;`,
);
assert.equal(
  (await db.query("select private.published_leg_recommendation('a') badge"))
    .rows[0].badge,
  null,
);
await db.exec(
  `reset role;update private.nfl_selection_gate_decisions set evidence=jsonb_set(evidence #- '{0,experimental}','{0,quote_observed_at}',to_jsonb((now()-interval '1 hour')::text));set role authenticated;`,
);
assert.equal(
  (await db.query("select private.published_leg_recommendation('a') badge"))
    .rows[0].badge,
  null,
);
await db.exec("reset role;set role anon");
await assert.rejects(db.query("select * from member_parlays"));
await assert.rejects(
  db.query("select create_member_parlay('Anon',array['a','b'])"),
);
console.log("Member parlay transaction verified");
await db.close();
