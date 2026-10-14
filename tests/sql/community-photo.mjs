import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  p = "00000000-0000-4000-8000-000000000003",
  p2 = "00000000-0000-4000-8000-000000000004";
await db.exec(`create role authenticated;create role anon;create schema auth;create schema private;create schema storage;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function public.is_admin() returns boolean language sql as $$select coalesce(current_setting('app.admin',true),'')='true'$$;
create function private.age_member_allowed() returns boolean language sql as $$select auth.uid() is not null and coalesce(current_setting('app.age',true),'')<>'blocked'$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create table public.community_profiles(user_id uuid,username text,visible boolean,avatar text);create table private.community_restrictions(user_id uuid);create table private.admin_users(user_id uuid);
create table private.account_erasure_jobs(user_id uuid primary key,lease_id uuid default gen_random_uuid(),ready boolean default false,expires_at timestamptz default now()+interval '10 minutes');
create table private.billing_orders(id uuid,user_id uuid,state text,checkout_id text,created_at timestamptz);create table private.billing_subscriptions(id text,user_id uuid,customer_id text,order_id uuid);
create table public.account_deletion_requests(user_id uuid,status text);
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,created_at timestamptz default now());alter table storage.objects enable row level security;
create function storage.foldername(text)returns text[] language sql as $$select string_to_array($1,'/')$$;
create table public.community_posts(id uuid primary key,user_id uuid,sport text default 'nfl',kind text default 'slip',title text,body text,legs jsonb default '[]',author_name text,created_at timestamptz default now());alter table public.community_posts enable row level security;
create table public.community_post_comments(user_id uuid,created_at timestamptz);
create table public.member_blocks(user_id uuid,target_user_id uuid);
create policy post_read on public.community_posts for select to authenticated using(not exists(select 1 from public.member_blocks where user_id=auth.uid() and target_user_id=community_posts.user_id) or public.is_admin());
create policy post_insert on public.community_posts for insert to authenticated with check(user_id=auth.uid());
grant usage on schema public,private,auth,storage to authenticated;grant execute on all functions in schema public,private,auth,storage to authenticated;grant select on public.community_profiles,public.community_post_comments,public.member_blocks to authenticated;grant select,insert on public.community_posts to authenticated;grant select,insert,delete on storage.objects to authenticated;
insert into auth.users values('${a}',now()),('${b}',now());insert into auth.sessions values('${p}', '${a}',null);insert into public.community_profiles values('${a}','owner',true,'photo'),('${b}','reader',true,'photo');`);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261014162515_community_post_photos.sql",
    "utf8",
  ),
);
await db.exec(
  `create trigger prepare_post before insert on public.community_posts for each row execute function private.prepare_member_publication();set role authenticated;select set_config('app.uid','${a}',false);`,
);
await assert.rejects(
  db.exec(
    `insert into storage.objects(bucket_id,name,owner_id)values('community-photos','${b}/${p}.jpg','${a}')`,
  ),
);
await db.exec(
  `insert into storage.objects(bucket_id,name,owner_id)values('community-photos','${a}/${p}.jpg','${a}')`,
);
await db.exec(
  `insert into public.community_posts(id,user_id,title,body,photo_path)values('${p}','${a}','Slip','Caption','${a}/${p}.jpg')`,
);
assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
await db.exec(`select set_config('app.uid','${b}',false)`);
assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
assert.equal(
  (await db.query("delete from storage.objects returning id")).rows.length,
  0,
);
await db.exec(
  `reset role;insert into public.member_blocks values('${b}','${a}');set role authenticated;`,
);
assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
await db.exec(`select set_config('app.admin','true',false)`);
assert.equal((await db.query("select * from storage.objects")).rows.length, 1);
await db.exec(`select set_config('app.age','blocked',false)`);
assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
await db.exec(
  `reset role;select set_config('app.uid','${a}',false);select set_config('app.age','',false);select set_config('app.admin','',false);`,
);
const plan = (
  await db.query(`select private.begin_account_erasure('${a}','${p}') as plan`)
).rows[0].plan;
assert.deepEqual(plan.storage_paths, [`${a}/${p}.jpg`]);
await assert.rejects(
  db.exec(`select private.authorize_account_erasure('${a}','${plan.lease}')`),
);
await db.exec(`set role authenticated`);
await assert.rejects(
  db.exec(
    `insert into storage.objects(bucket_id,name,owner_id)values('community-photos','${a}/${p2}.jpg','${a}')`,
  ),
);
await db.exec(`reset role;delete from storage.objects where owner_id='${a}'`);
await db.exec(
  `select private.authorize_account_erasure('${a}','${plan.lease}')`,
);
assert.equal(
  (
    await db.query(
      `select ready from private.account_erasure_jobs where user_id='${a}'`,
    )
  ).rows[0].ready,
  true,
);
console.log(
  "Photo policy checks passed: photo-only slip, ownership, visibility, blocking, moderation, age gate and erasure upload guard.",
);
await db.close();
