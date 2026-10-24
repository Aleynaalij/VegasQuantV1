import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003",
  p = "00000000-0000-4000-8000-000000000004",
  comment = "00000000-0000-4000-8000-000000000005";
await db.exec(
  `create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text);
create function private.age_eligible(uuid)returns boolean language sql as $$select true$$;
create function private.age_member_allowed()returns boolean language sql as $$select auth.uid() is not null$$;
create table private.account_erasure_jobs(user_id uuid,expires_at timestamptz);create table private.community_restrictions(user_id uuid);
create table public.member_blocks(user_id uuid,target_user_id uuid);
create function private.community_member_allowed(target uuid)returns boolean language sql security definer as $$select not exists(select 1 from public.member_blocks where(user_id=auth.uid() and target_user_id=target)or(target_user_id=auth.uid() and user_id=target))$$;
create table public.community_profiles(user_id uuid,username text,avatar text,visible boolean);
create table public.community_posts(id uuid primary key,user_id uuid,sport text,body text);
create table public.community_post_comments(id uuid primary key,user_id uuid,post_id uuid,body text,created_at timestamptz default now());
create table public.community_reactions(post_id uuid,user_id uuid,created_at timestamptz default now(),primary key(post_id,user_id));
create table public.member_follows(user_id uuid,target_user_id uuid,created_at timestamptz default now(),primary key(user_id,target_user_id));
create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid,endpoint text,p256dh text,auth text);
create table public.app_updates(id uuid primary key default gen_random_uuid(),title text,body text,created_at timestamptz default now());create table public.app_update_reads(user_id uuid,update_id uuid,read_at timestamptz default now());
grant usage on schema public,private,auth to authenticated;grant execute on all functions in schema auth,private to authenticated;
grant select on public.community_post_comments,public.community_comment_reactions to authenticated;
insert into auth.users values('${a}','a@example.com',now(),'old'),('${b}','b@example.com',now(),'old'),('${c}','c@example.com',now(),'old');
insert into public.community_profiles values('${a}','Alice','a.jpg',true),('${b}','Bob','b.jpg',true),('${c}','Carol','c.jpg',true);`.replace(
    "grant select on public.community_post_comments,public.community_comment_reactions to authenticated;",
    "grant select on public.community_post_comments to authenticated;",
  ),
);
await db.exec(
  fs
    .readFileSync(
      "supabase/migrations/20261017015506_social_notification_system.sql",
      "utf8",
    )
    .replace(/^select cron.schedule.*$/gm, ""),
);

await db.exec(`create schema storage;create table storage.objects(bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
create function public.is_admin() returns boolean language sql as $$select current_setting('app.admin',true)='true'$$;`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261023210220_ruby_contributor_cards.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261023212700_ruby_feature_account_erasure.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024080046_goat_diamond_contributor.sql",
    "utf8",
  ),
);
await db.exec(`create function private.is_admin() returns boolean language sql as 'select public.is_admin()';create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'Published records are immutable. Add a new version or an explicit correction event.';end$$;`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024134617_admin_contributor_card_revisions.sql",
    "utf8",
  ),
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024160000_card_revision_erasure.sql",
    "utf8",
  ),
);
await db.exec(
  `insert into public.ruby_contributors(user_id,brand,theme) values('${c}','The GOAT','diamond')`,
);
await assert.rejects(
  db.exec(
    `update public.ruby_contributors set theme='orbit' where user_id='${c}'`,
  ),
  /check constraint|unique constraint/,
);
await db.exec(
  `insert into public.ruby_contributors(user_id,brand,theme) values('${a}','OmaticsZone','orbit');insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${b}','https://example.invalid','key','auth');insert into public.notification_preferences(user_id,push_enabled) values('${b}',true) on conflict(user_id) do update set push_enabled=true;set app.uid='${a}';set role authenticated;`,
);
const id = "00000000-0000-4000-8000-000000000010";
const call = `select public.submit_ruby('${id}','NFL','Daily test','["A over 1.5","B over 2.5"]','','',null,null)`;
const submit = call.replace("'','',null,null", "'',null,null,null");
await db.exec(submit);
await db.exec(submit);
await db.exec(`set app.admin='false'`);
const editCall = `select public.edit_ruby('${id}',0,'Corrected title','["A over 1.5","B over 2.5"]','Updated note','NFL',null,null,null)`;
await assert.rejects(db.exec(editCall), /Verified admin/);
await db.exec(`set app.admin='true'`);
await db.exec(editCall);
assert.equal(
  (await db.query(`select title from public.ruby_cards where id='${id}'`))
    .rows[0].title,
  "Corrected title",
);
assert.equal(
  (await db.query(`select title from public.ruby_submissions where id='${id}'`))
    .rows[0].title,
  "Daily test",
);
await assert.rejects(db.exec(editCall), /Card changed/);
await assert.rejects(
  db.exec(`update public.ruby_card_revisions set title='overwrite'`),
  /permission denied/,
);
await db.exec(`set app.admin='false'`);

assert.equal(
  (await db.query("select count(*)::int n from public.ruby_submissions"))
    .rows[0].n,
  1,
);
await assert.rejects(
  db.exec(
    submit
      .replace(id, "00000000-0000-4000-8000-000000000011")
      .replace("'NFL'", "'NBA'"),
  ),
  /already published/,
);
await assert.rejects(
  db.exec(`update public.ruby_submissions set title='changed'`),
  /permission denied/,
);
await assert.rejects(
  db.exec(`delete from public.ruby_submissions`),
  /permission denied/,
);
await assert.rejects(
  db.exec(
    `insert into public.ruby_contributors(user_id,brand,theme) values('${b}','FranksCorner','corner')`,
  ),
  /permission denied/,
);
await db.exec(`reset role;`);
assert.equal(
  (
    await db.query(
      `select count(*)::int n from public.notifications where type='contributor'`,
    )
  ).rows[0].n,
  2,
);
assert.equal(
  (
    await db.query(
      `select count(*)::int n from private.notification_deliveries`,
    )
  ).rows[0].n,
  1,
);
await db.exec(`select private.ruby_notify()`).catch(() => {}); // trigger functions cannot be called directly
await db.exec(`set role authenticated;set app.uid='${b}'`);
await assert.rejects(
  db.exec(submit.replace(id, "00000000-0000-4000-8000-000000000012")),
  /Contributor access/,
);
await assert.rejects(
  db.exec(
    `select public.feature_ruby('${id}',100,'Test','https://example.invalid',now())`,
  ),
  /Admin verification/,
);
await db.exec(
  `reset role;set app.uid='${a}';set app.admin='true';set role authenticated;`,
);
await assert.rejects(
  db.exec(
    `select public.feature_ruby('${id}',-110,'Test','https://example.invalid',now())`,
  ),
  /check constraint/,
);
await assert.rejects(
  db.exec(
    `select public.feature_ruby('${id}',100,'Test','https://example.invalid',now()-interval '1 hour')`,
  ),
  /last 30 minutes/,
);
await db.exec(
  `select public.feature_ruby('${id}',100,'Test','https://example.invalid',now())`,
);
await assert.rejects(
  db.exec(
    `select public.feature_ruby('${id}',200,'Test','https://example.invalid',now())`,
  ),
  /duplicate key/,
);
await db.exec(
  `reset role;insert into public.member_blocks values('${b}','${a}');set app.uid='${b}';set role authenticated;`,
);
assert.equal(
  (await db.query("select count(*)::int n from public.ruby_submissions"))
    .rows[0].n,
  0,
);
assert.equal(
  (await db.query("select count(*)::int n from public.ruby_daily_features"))
    .rows[0].n,
  0,
);
await db.exec(
  `reset role;delete from public.member_blocks;insert into public.ruby_contributors(user_id,brand,theme) values('${b}','FranksCorner','corner');update public.notification_preferences set disabled_types=array['contributor'] where user_id='${c}';insert into storage.objects values('community-photos','${b}/00000000-0000-4000-8000-000000000020.jpg','${b}');set app.uid='${b}';set role authenticated;`,
);
await assert.rejects(
  db.exec(
    `select public.submit_ruby('00000000-0000-4000-8000-000000000020','NBA','Screenshot test','[]','','${a}/00000000-0000-4000-8000-000000000020.jpg',null,null)`,
  ),
  /Upload your own/,
);
await db.exec(
  `select public.submit_ruby('00000000-0000-4000-8000-000000000020','NBA','Screenshot test','[]','','${b}/00000000-0000-4000-8000-000000000020.jpg',null,null);reset role;`,
);
assert.equal(
  (
    await db.query(
      `select count(*)::int n from public.notifications where type='contributor' and recipient_id='${c}'`,
    )
  ).rows[0].n,
  1,
);
await db.exec(`set app.uid='${a}';set role authenticated;`);
assert.equal(
  (
    await db.query(
      `select count(*)::int n from storage.objects where name='${b}/00000000-0000-4000-8000-000000000020.jpg'`,
    )
  ).rows[0].n,
  1,
);
await db.exec(
  `reset role;insert into public.member_blocks values('${a}','${b}');set role authenticated;`,
);
assert.equal(
  (
    await db.query(
      `select count(*)::int n from storage.objects where name='${b}/00000000-0000-4000-8000-000000000020.jpg'`,
    )
  ).rows[0].n,
  0,
);
// Revisions stay append-only even for the table owner: no direct delete, rewrite or editor scrub.
await db.exec(`reset role`);
const revisions = async () => (await db.query(`select count(*)::int n from public.ruby_card_revisions`)).rows[0].n;
assert.equal(await revisions(), 1);
await assert.rejects(db.exec(`delete from public.ruby_card_revisions`), /immutable/);
await assert.rejects(db.exec(`update public.ruby_card_revisions set title='overwrite'`), /immutable/);
await assert.rejects(db.exec(`update public.ruby_card_revisions set edited_by=null`), /immutable/);
// Erasing a separate editing admin keeps the revision and only clears its editor.
const editor = "00000000-0000-4000-8000-0000000000e1";
const second = "00000000-0000-4000-8000-0000000000e2";
await db.exec(`insert into auth.users values('${editor}','editor@example.com',now(),'old');
 insert into public.ruby_card_revisions(id,user_id,brand,theme,submission_day,sport,title,legs,note,submission_id,revision,edited_by)
 select '${second}',user_id,brand,theme,submission_day,sport,'Second edit',legs,note,id,2,'${editor}' from public.ruby_submissions where id='${id}';
 delete from auth.users where id='${editor}';`);
assert.deepEqual(
  (await db.query(`select title, edited_by from public.ruby_card_revisions where id='${second}'`)).rows[0],
  { title: "Second edit", edited_by: null },
);
assert.equal(await revisions(), 2);
await db.exec(
  `reset role;update public.ruby_daily_features set submission_id='00000000-0000-4000-8000-000000000020';delete from auth.users where id='${a}';`,
);
// Erasing the contributor (who also made the first edit) removes the card and its revisions.
assert.equal(await revisions(), 0);
assert.equal(
  (await db.query("select verified_by from public.ruby_daily_features")).rows[0]
    .verified_by,
  null,
);
await db.exec(`reset role;set role anon`);
await assert.rejects(
  db.query("select * from public.ruby_submissions"),
  /permission denied/,
);
console.log(
  "PASS Ruby daily cross-sport quota, idempotency, immutability, contributor-only publishing, notifications/push dedup, +100 curation floor, stale quote rejection and block isolation",
);
await db.close();
