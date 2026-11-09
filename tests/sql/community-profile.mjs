import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
// Member profiles: visibility (own / visible / confirmed / not hidden), aggregate follow counts and posts.
const db = new PGlite();
const A = "00000000-0000-4000-8000-00000000000a"; // viewer
const B = "00000000-0000-4000-8000-00000000000b"; // visible member
const C = "00000000-0000-4000-8000-00000000000c"; // hidden profile
const D = "00000000-0000-4000-8000-00000000000d"; // unconfirmed
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key, email_confirmed_at timestamptz, banned_until timestamptz, created_at timestamptz default '2026-10-01');
insert into auth.users(id,email_confirmed_at) values ('${A}',now()),('${B}',now()),('${C}',now()),('${D}',null);
create table private.blocked(user_id uuid, target uuid);
create function private.age_member_allowed() returns boolean language sql stable as $$select auth.uid() is not null$$;
create function private.is_dealer_publisher(u uuid) returns boolean language sql stable as $$select false$$;
create function private.community_member_allowed(target uuid) returns boolean language sql stable security definer set search_path='' as
 $$select not exists(select 1 from private.blocked where user_id=auth.uid() and target=community_member_allowed.target)$$;
grant usage on schema private, auth to authenticated;
grant execute on all functions in schema private to authenticated;
create table public.community_profiles(user_id uuid primary key, username text, region text, avatar text, visible boolean, instagram_url text, x_url text, updated_at timestamptz default now());
insert into public.community_profiles values ('${A}','viewer',null,null,true,null,null),('${B}','SharpShooter','NYC','b.jpg',true,'https://instagram.com/x',null),('${C}','Ghost',null,null,false,null,null),('${D}','Pending',null,null,true,null,null);
create table public.member_follows(user_id uuid, target_user_id uuid, created_at timestamptz default now());
insert into public.member_follows values ('${A}','${B}'),('${C}','${B}'),('${B}','${A}');
create table public.community_posts(id uuid primary key default gen_random_uuid(), user_id uuid, sport text, kind text, title text, body text, legs jsonb default '[]', photo_path text, card text, created_at timestamptz default now());
insert into public.community_posts(user_id,sport,kind,title,body,created_at) values ('${B}','nfl','talk','t','first','2026-11-01'),('${B}','nhl','talk','t','second','2026-11-02'),('${A}','nfl','talk','t','mine','2026-11-03');
create table public.community_reactions(post_id uuid, user_id uuid);
create table public.community_post_comments(post_id uuid, user_id uuid);`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261109020607_community_profile.sql",
    "utf8",
  ),
);
const firstB = (
  await db.query(`select id from public.community_posts where body='second'`)
).rows[0].id;
await db.exec(
  `insert into public.community_reactions values ('${firstB}','${A}'); insert into public.community_post_comments values ('${firstB}','${A}'),('${firstB}','${C}')`,
);

const as = async (uid, name) => {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`,
  );
  try {
    return (await db.query("select public.community_profile($1) r", [name]))
      .rows[0].r;
  } finally {
    await db.exec("reset role");
  }
};

const b = await as(A, "sharpshooter");
assert.equal(b.username, "SharpShooter", "username lookup is case-insensitive");
assert.deepEqual(
  [b.followers, b.following, b.post_count, b.is_me, b.i_follow],
  [2, 1, 2, false, true],
);
assert.deepEqual(
  b.posts.map((p) => p.body),
  ["second", "first"],
  "newest first",
);
assert.deepEqual([b.posts[0].reactions, b.posts[0].comments], [1, 2]);
assert.equal(
  JSON.stringify(b).includes(C),
  false,
  "follower identities are never returned",
);
assert.equal((await as(A, "viewer")).is_me, true);
assert.equal(
  await as(A, "Ghost"),
  null,
  "hidden profiles are not shown to others",
);
assert.equal(
  (await as(C, "Ghost")).username,
  "Ghost",
  "your own hidden profile is shown to you",
);
assert.equal(
  await as(A, "Pending"),
  null,
  "unconfirmed accounts are not shown",
);
assert.equal(await as(A, "nobody"), null);
await db.exec(`insert into private.blocked values ('${A}','${B}')`);
assert.equal(
  await as(A, "SharpShooter"),
  null,
  "blocked/hidden members are not shown",
);
await db.exec(
  `reset role; select set_config('request.jwt.claim.sub','',false); set role anon;`,
);
await assert.rejects(
  db.query("select public.community_profile('SharpShooter')"),
  /permission denied/,
);
await db.exec("reset role");
// Part 2: tagline, bio and state, edited by the owner; text runs through the safety pattern.
await db.exec("delete from private.blocked");
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261109022151_community_profile_fields.sql",
    "utf8",
  ),
);
await db.exec(
  `update public.community_profiles set tagline='  Fading the public  ', bio='NFL unders and NHL totals.', state='NV' where user_id='${B}'`,
);
const b2 = await as(A, "SharpShooter");
assert.deepEqual(
  [b2.tagline, b2.bio, b2.state],
  ["Fading the public", "NFL unders and NHL totals.", "NV"],
  "trimmed and returned",
);
await assert.rejects(
  db.exec(
    `update public.community_profiles set state='Nevada' where user_id='${B}'`,
  ),
  /check/,
);
await assert.rejects(
  db.exec(
    `update public.community_profiles set tagline='${"x".repeat(61)}' where user_id='${B}'`,
  ),
  /check/,
);
await assert.rejects(
  db.exec(
    `update public.community_profiles set bio='${"x".repeat(281)}' where user_id='${B}'`,
  ),
  /check/,
);
await assert.rejects(
  db.exec(
    `update public.community_profiles set bio='Guaranteed profit every night' where user_id='${B}'`,
  ),
  /guaranteed-return/,
);
await assert.rejects(
  db.exec(
    `update public.community_profiles set tagline='<script>x</script>' where user_id='${B}'`,
  ),
  /guaranteed-return/,
);
console.log("Community profile SQL checks passed.");
