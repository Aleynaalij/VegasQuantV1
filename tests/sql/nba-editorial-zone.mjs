import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(),
  author = "00000000-0000-4000-8000-000000000042";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create function private.has_membership()returns boolean language sql as $$select false$$;
create function private.age_member_allowed()returns boolean language sql as $$select false$$;
create function private.age_eligible(uuid)returns boolean language sql as $$select current_setting('test.age',true)='yes'$$;
grant usage on schema private to anon,authenticated;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table private.zone_automation(name text primary key,user_id uuid);
insert into private.zone_automation values('nba_threes','${author}');
create table public.community_profiles(user_id uuid,username text,avatar text);
create table public.community_posts(id uuid primary key,user_id uuid,sport text,kind text,title text,body text,legs jsonb);
create function private.test_post_guard()returns trigger language plpgsql as $$begin if current_setting('test.fail',true)='yes' then raise exception 'Fixture post failure';end if;if auth.uid()<>new.user_id then raise exception 'Wrong actor';end if;return new;end$$;
create trigger fixture_post_guard before insert on public.community_posts for each row execute function private.test_post_guard();
create table public.nba_games(id uuid primary key,season_type int,tipoff_tbd boolean,tipoff timestamptz,status text);
create table public.nba_observations(id uuid primary key,game_id uuid,kind text,payload jsonb,observed_at timestamptz,recorded_at timestamptz,source text);
insert into public.nba_games values('00000000-0000-4000-8000-000000000001',2,false,now()+interval '1 day','STATUS_SCHEDULED');
insert into public.nba_observations values('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','prop','{"book":"FanDuel","market":"player_points","outcomes":[{"description":"Sample Player","name":"Over","point":20.5,"price":-110}]}',now()-interval '1 minute',now()-interval '10 seconds','https://example.invalid/quote');`);
for (const f of [
  "20261020021929_nba_editorial_picks.sql",
  "20261020023605_nba_editorial_provenance_and_revisions.sql",
  "20261020024250_nba_editorial_source_timeline.sql",
  "20261020024912_nba_editorial_quote_timeline.sql",
  "20261031181000_nba_editorial_zone.sql",
])
  await db.exec(readFileSync("supabase/migrations/" + f, "utf8"));
let p = {
  publication_key: "SYNTHETIC-zone-test",
  game_id: "00000000-0000-4000-8000-000000000001",
  quote_observation_id: "00000000-0000-4000-8000-000000000002",
  player: "Sample Player",
  market: "player_points",
  direction: "Over",
  line: 20.5,
  odds: -110,
  book: "FanDuel",
  rationale: "Verified local synthetic role and opportunity evidence.",
  risk: "Minutes may change in this synthetic fixture.",
  unknowns: "Final lineup not yet confirmed.",
  sources: [
    { url: "https://example.invalid/role", label: "Role" },
    { url: "https://example.invalid/injury", label: "Availability" },
  ],
  evidence: {
    historical_cutoff: new Date(Date.now() - 10000).toISOString(),
    role_review: "Synthetic starter",
    availability_review: "Synthetic review",
    generated_at: new Date(Date.now() - 5000).toISOString(),
    quote_observation_id: "00000000-0000-4000-8000-000000000002",
    source_files: ["role", "injury"].map((x) => ({
      url: "https://example.invalid/" + x,
      sha256: "a".repeat(64),
      retrieved_at: new Date(Date.now() - 6000).toISOString(),
    })),
  },
};
const hash = (
  await db.query(
    "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') h",
    [p.evidence],
  )
).rows[0].h;
p.evidence.input_sha256 = hash;
const publish = (value = p, expected = author) =>
  db.query("select private.publish_nba_editorial_zone($1,$2::uuid) r", [
    value,
    expected,
  ]);
for (const role of ["anon", "authenticated", "service_role"])
  assert.equal(
    (
      await db.query(
        "select has_function_privilege($1,'private.publish_nba_editorial_zone(jsonb,uuid)','execute') p",
        [role],
      )
    ).rows[0].p,
    false,
  );
await assert.rejects(
  publish(p, "00000000-0000-4000-8000-000000000099"),
  /identity mismatch/,
);
await assert.rejects(publish(), /profile or age/);
await db.exec(
  `set test.age='yes';insert into public.community_profiles values('${author}','MikeQ','synthetic')`,
);
await assert.rejects(publish({ ...p, odds: -120 }), /exact recent/);
await db.exec("set test.fail='yes'");
await assert.rejects(publish(), /Fixture post failure/);
assert.equal(
  (await db.query("select count(*)::int n from public.nba_editorial_picks"))
    .rows[0].n,
  0,
);
await db.exec("set test.fail='no'");
const first = (await publish()).rows[0].r;
assert.equal(first.status, "POSTED");
const again = (await publish()).rows[0].r;
assert.equal(again.status, "ALREADY_POSTED");
assert.equal(first.pick_id, again.pick_id);
assert.equal(first.post_id, again.post_id);
assert.equal(
  (await db.query("select count(*)::int n from public.community_posts")).rows[0]
    .n,
  1,
);
const post = (await db.query("select * from public.community_posts")).rows[0];
assert.equal(post.user_id, author);
assert.match(post.body, /20.5 points \(-110 at FanDuel/);
assert.equal(post.sport, "nba");
assert.equal(
  (
    await db.query(
      "select nullif(current_setting('request.jwt.claim.sub',true),'') restored",
    )
  ).rows[0].restored,
  null,
);
await assert.rejects(
  publish({ ...p, line: 21.5 }),
  /another immutable selection/,
);
console.log(
  "PASS NBA editorial Zone: server-only, verified author, exact existing guards, atomic rollback, one journal/post and actor restoration",
);
await db.close();
