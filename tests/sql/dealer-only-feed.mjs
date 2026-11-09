import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Synthetic tables/JWT infrastructure; exact repository identity, block and age functions.
// Read policies below reproduce the existing production policies, not new grants to production.
const db = new PGlite();
const read = (path) => fs.readFileSync(path, "utf8");
const fn = (path, name) => {
  const source = read(path),
    at = source.indexOf(`function ${name}(`);
  assert.ok(at >= 0);
  return source.slice(
    source.lastIndexOf("create ", at),
    source.indexOf("$$;", at) + 3,
  );
};
const viewer = "00000000-0000-4000-8000-000000000001";
const dealer = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
const session = "00000000-0000-4000-8000-000000000004";
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema private; create schema auth;
 grant usage on schema public,private,auth to authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
 create function public.is_admin() returns boolean language sql stable as $$ select false $$;
 create table auth.users(id uuid primary key,email text,phone text,encrypted_password text,raw_app_meta_data jsonb,banned_until timestamptz);
 create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
 create table private.zone_automation(name text primary key,user_id uuid);
 create table public.community_profiles(user_id uuid,username text);
 create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,author_name text,sport text,kind text,title text,body text,card text,legs jsonb default '[]',created_at timestamptz);
 create table public.community_reactions(post_id uuid,user_id uuid);
 create table public.community_post_comments(post_id uuid,user_id uuid);
 create table public.member_follows(user_id uuid,target_user_id uuid);
 create table public.member_blocks(user_id uuid,target_user_id uuid);
 create table private.age_policy(singleton boolean,enforced boolean,version int);
 create table private.age_checks(user_id uuid,state text,policy_version int);
 insert into private.age_policy values(true,true,1);
 insert into private.age_checks values('${viewer}','verified',1);
 insert into auth.sessions values('${session}','${viewer}',null);
 insert into auth.users values('${dealer}',null,null,null,'{"publisher":"vq_dealer"}','infinity'),('${other}','synthetic@example.invalid',null,null,'{}',null);
 insert into private.zone_automation values('vq_dealer','${dealer}');
 insert into public.community_profiles values('${dealer}','TheDealer'),('${other}','Other');
 insert into public.community_posts(user_id,author_name,sport,kind,title,body,card,created_at)
 select '${dealer}','TheDealer',case when n%2=0 then 'nba' else 'nfl' end,'talk',case when n=25 then 'Live pick update' else 'Synthetic chart '||n end,'Synthetic only',case when n=25 then null else 'vq-publication:v1' end,'2026-11-08'::timestamptz+n*interval '1 minute' from generate_series(1,25)n;
 insert into public.community_posts(user_id,author_name,sport,kind,title,body,card,created_at)
 select '${other}','TheDealer','nfl','talk','Spoofed newer member name','Synthetic only','vq-publication:v1','2026-11-09'::timestamptz+n*interval '1 minute' from generate_series(1,60)n;
`);
await db.exec(
  fn(
    "supabase/migrations/20261106221738_dealer_profile_visibility.sql",
    "private.is_dealer_publisher",
  ),
);
await db.exec(
  fn(
    "supabase/migrations/20261014041536_launch_safety_controls.sql",
    "private.community_member_allowed",
  ),
);
await db.exec(
  fn(
    "supabase/migrations/20261014103812_verified_age_gate.sql",
    "private.age_eligible",
  ),
);
await db.exec(
  fn(
    "supabase/migrations/20261014103812_verified_age_gate.sql",
    "private.age_member_allowed",
  ),
);
await db.exec(`
 revoke all on all tables in schema auth,private from public,anon,authenticated;
 revoke all on function private.is_dealer_publisher(uuid),private.age_eligible(uuid) from public,anon,authenticated;
 grant execute on function private.community_member_allowed(uuid),private.age_member_allowed() to authenticated;
 alter table public.community_posts enable row level security;
 create policy community_posts_read on public.community_posts for select to authenticated using(private.community_member_allowed(user_id) or (select public.is_admin()));
 alter table public.community_reactions enable row level security;
 create policy community_reactions_read on public.community_reactions for select to authenticated using(true);
 alter table public.community_post_comments enable row level security;
 create policy community_comments_read on public.community_post_comments for select to authenticated using(private.community_member_allowed(user_id) or (select public.is_admin()));
 alter table public.member_follows enable row level security;
 create policy member_follows_read on public.member_follows for select to authenticated using(user_id=(select auth.uid()));
 grant select on public.community_posts,public.community_reactions,public.community_post_comments,public.member_follows to authenticated;
 do $$ declare t text; begin foreach t in array array['community_posts','community_reactions','community_post_comments','member_follows'] loop
 execute format('create policy age_verified_account on public.%I as restrictive for all to authenticated using((select private.age_member_allowed()))',t); end loop; end $$;
`);
await db.exec(
  read("supabase/migrations/20261109210336_dealer_only_zone_feed.sql"),
);
const asViewer = async () =>
  db.exec(
    `set role authenticated; select set_config('request.jwt.claim.sub','${viewer}',false);select set_config('request.jwt.claims','{"session_id":"${session}"}',false);`,
  );
const owner = async () => db.exec("reset role");
const feed = async (sport = "all", limit = 20) =>
  (
    await db.query("select public.community_dealer_feed($1,$2) data", [
      sport,
      limit,
    ])
  ).rows[0].data;
try {
  await asViewer();
  const initial = await feed();
  assert.equal(
    initial.length,
    20,
    "filters the true publisher before LIMIT despite 60 newer spoof/member rows",
  );
  assert.ok(initial.every((p) => p.user_id === dealer));
  assert.equal(initial[0].title, "Live pick update");
  assert.equal(
    initial[0].card,
    null,
    "Dealer plays without card tags are included",
  );
  assert.equal((await feed("all", 1000)).length, 25);
  assert.equal((await feed("nba", 100)).length, 12);
  assert.equal((await feed("nfl", 100)).length, 13);
  assert.deepEqual(await feed("unknown"), []);
  assert.equal((await feed("all", 0)).length, 1);
  await assert.rejects(
    db.query("select * from private.zone_automation"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select private.is_dealer_publisher($1)", [dealer]),
    /permission denied/,
  );
  for (const reverse of [false, true]) {
    await owner();
    await db.query(
      "insert into public.member_blocks values($1,$2)",
      reverse ? [dealer, viewer] : [viewer, dealer],
    );
    await asViewer();
    assert.deepEqual(
      await feed(),
      [],
      "existing reciprocal-block RLS remains enforced",
    );
    await owner();
    await db.exec("delete from public.member_blocks");
  }
  await db.exec("update private.age_checks set state='underage'");
  await asViewer();
  assert.deepEqual(
    await feed(),
    [],
    "age denial remains enforced under the actual caller role",
  );
  await owner();
  await db.exec(
    "update private.age_checks set state='verified';update auth.sessions set not_after=now()-interval '1 second'",
  );
  await asViewer();
  assert.deepEqual(await feed(), [], "expired session remains denied");
  await owner();
  await db.exec("update auth.sessions set not_after=null");
  await db.query("update private.zone_automation set user_id=$1", [other]);
  await asViewer();
  assert.deepEqual(
    await feed(),
    [],
    "a non-publisher cannot become Dealer merely through a configured UUID",
  );
  await owner();
  await db.query("update private.zone_automation set user_id=$1", [dealer]);
  await asViewer();
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  assert.deepEqual(
    await feed(),
    [],
    "no actor means no publisher identity or rows",
  );
  await owner();
  const grants = (
    await db.query(
      `select has_function_privilege('anon','public.community_dealer_feed(text,integer)','execute') public_anon,has_function_privilege('anon','private.zone_dealer_publisher_id()','execute') helper_anon,(select prosecdef from pg_proc where oid='public.community_dealer_feed(text,integer)'::regprocedure) feed_definer`,
    )
  ).rows[0];
  assert.deepEqual(grants, {
    public_anon: false,
    helper_anon: false,
    feed_definer: false,
  });
  await db.exec("set role anon");
  await assert.rejects(feed(), /permission denied/);
  console.log(
    "PASS Dealer-only SQL: actual authenticated role, trusted identity, spoof exclusion, pre-limit filtering, sport/limit, non-card plays, no private-table access, anonymous/block/age/session denial.",
  );
} finally {
  await db.close();
}
