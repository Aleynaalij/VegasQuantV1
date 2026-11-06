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
create table private.age_policy(singleton boolean,enforced boolean,version int);insert into private.age_policy values(true,true,1);
create table private.age_checks(user_id uuid,state text,policy_version int default 1);
create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create function auth.jwt()returns jsonb language sql as $$select jsonb_build_object('session_id','00000000-0000-4000-8000-000000000099')$$;
create function private.age_eligible(p_user uuid)returns boolean language sql as $$select exists(select 1 from private.age_checks where user_id=p_user and state='verified')$$;
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
insert into private.age_checks(user_id,state) values('${a}','verified'),('${b}','verified'),('${c}','verified');
insert into auth.sessions values('00000000-0000-4000-8000-000000000099','${a}',now()+interval '1 day');
insert into public.community_profiles values('${a}','Alice','a.jpg',true),('${b}','Bob','b.jpg',true),('${c}','Carol','c.jpg',true);`.replace(
    "grant select on public.community_post_comments,public.community_comment_reactions to authenticated;",
    "grant select on public.community_post_comments to authenticated;",
  ),
);
const age=fs.readFileSync('supabase/migrations/20261014103812_verified_age_gate.sql','utf8');
for (const name of ['private.age_eligible','private.age_member_allowed']) {
 const start=age.indexOf('create function '+name+'('), end=age.indexOf('$$;',start)+3;
 assert.ok(start>=0&&end>start);await db.exec(age.slice(start,end).replace('create function','create or replace function'));
}
await db.exec(
  fs
    .readFileSync(
      "supabase/migrations/20261017015506_social_notification_system.sql",
      "utf8",
    )
    .replace(/^select cron.schedule.*$/gm, ""),
);

await db.exec(`create schema storage;create table storage.objects(bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
create function public.is_admin() returns boolean language sql as $$select nullif(current_setting('app.admin',true),'')='true'$$;`);
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
await db.exec(
  `create function private.is_admin() returns boolean language sql as 'select public.is_admin()';create function private.immutable() returns trigger language plpgsql as $$begin raise exception 'Published records are immutable. Add a new version or an explicit correction event.';end$$;`,
);
await db.exec(
  fs.readFileSync(
    "supabase/migrations/20261024134617_admin_contributor_card_revisions.sql",
    "utf8",
  ),
);
await db.exec(fs.readFileSync('supabase/migrations/20261024134918_admin_card_edit_verified_check.sql','utf8'));
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

await db.exec('reset role');
await db.exec(fs.readFileSync('supabase/migrations/20261024190000_contributor_records.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261105233947_ruby_kalshi_source_link.sql','utf8'));
const canonical='https://kalshi.com/markets/kxmvecrosscategory/combo/sample-combo?marketTicker=SYNTHETIC-YES';
for(const raw of [canonical+'&marketTicker=OTHER',canonical.replace('kalshi.com','kalshi.com.evil.example'),canonical.replace('https:','http:'),canonical.replace('kalshi.com','kalshi.com:443'),canonical+'%0a',canonical+'&MarketTicker=X',canonical+'&eventTicker=OTHER']) {
 assert.equal((await db.query('select private.normalize_kalshi_source_link($1) v',[raw])).rows[0].v,null,raw);
}
assert.equal((await db.query('select private.normalize_kalshi_source_link($1) v',[canonical+'&utm_source=example&action=buy#fragment'])).rows[0].v,canonical);
await db.exec(`set app.uid='${a}';set role authenticated;set app.admin='false';`);
const id='00000000-0000-4000-8000-000000000010';
const submit=async(pid,link=canonical)=>db.query(`select public.submit_ruby_link($1,'NFL','Shared source','[]','',null,null,null,$2) id`,[pid,link]);
await db.exec(`reset role;update public.community_profiles set avatar=null where user_id='${a}';set role authenticated;`);
await assert.rejects(submit(id),/Finish your community profile/);
await db.exec(`reset role;update public.community_profiles set avatar='a.jpg' where user_id='${a}';update auth.users set email_confirmed_at=null where id='${a}';set role authenticated;`);
await assert.rejects(submit(id),/Sign in and complete account verification/);
await db.exec(`reset role;update auth.users set email_confirmed_at=now() where id='${a}';set role authenticated;`);
await db.exec(`reset role;delete from private.age_checks where user_id='${a}';set role authenticated;`);
await assert.rejects(submit(id),/age|Age|verification/);
await db.exec(`reset role;insert into private.age_checks(user_id,state) values('${a}','verified');insert into private.account_erasure_jobs values('${a}',now()+interval '1 day');set role authenticated;`);
await assert.rejects(submit(id),/eras|Eras|delet|Delet/);
await db.exec(`reset role;delete from private.account_erasure_jobs where user_id='${a}';set role authenticated;`);
await assert.rejects(submit(id,canonical.replace('kalshi.com','evil.example')),/Invalid Kalshi/);
for (const raw of JSON.parse(fs.readFileSync('tests/kalshi-source-adversarial.json','utf8'))) {
 await assert.rejects(submit(id,raw),/Invalid Kalshi/);
}
await submit(id,canonical+'&utm_source=sample');await submit(id);
assert.equal((await db.query(`select source_link from public.ruby_cards where id=$1`,[id])).rows[0].source_link,canonical);
await db.exec(`reset role;delete from private.age_checks where user_id='${a}';set role authenticated;`);
await assert.rejects(submit(id),/age|Age|verification/);
await db.exec(`reset role;insert into private.age_checks(user_id,state) values('${a}','verified');insert into private.account_erasure_jobs values('${a}',now()+interval '1 day');set role authenticated;`);
await assert.rejects(submit(id),/eras|Eras|delet|Delet/);
await db.exec(`reset role;delete from private.account_erasure_jobs where user_id='${a}';set role authenticated;`);
await assert.rejects(submit(id,canonical.replace('SYNTHETIC-YES','OTHER')),/identifier already used/);
assert.equal((await db.query(`select count(*)::int n from public.ruby_submissions where id=$1`,[id])).rows[0].n,1);
await assert.rejects(db.query(`insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,source_link) values(gen_random_uuid(),$1,'OmaticsZone','orbit','NFL','bad',$2)`,[a,canonical]),/permission denied/);
await assert.rejects(db.query(`select public.edit_ruby_link($1,0,'Edited','[]','','NFL',null,null,null,$2)`,[id,canonical]),/Verified admin/);
await db.exec(`set app.admin=''`);
await assert.rejects(db.query(`select public.edit_ruby_link($1,0,'Null admin','[]','','NFL',null,null,null,$2)`,[id,canonical]),/Verified admin/);
await db.exec(`set app.admin='true'`);
for (const raw of JSON.parse(fs.readFileSync('tests/kalshi-source-adversarial.json','utf8'))) {
 await assert.rejects(db.query(`select public.edit_ruby_link($1,0,'Bad','[]','','NFL',null,null,null,$2)`,[id,raw]),/Invalid Kalshi/);
}
const changed=canonical.replace('SYNTHETIC-YES','SYNTHETIC-NEXT');
await db.query(`select public.edit_ruby_link($1,0,'Edited source','[]','','NFL',null,null,null,$2)`,[id,changed]);
assert.equal((await db.query(`select source_link from public.ruby_cards where id=$1`,[id])).rows[0].source_link,changed);
assert.equal((await db.query(`select source_link from public.ruby_submissions where id=$1`,[id])).rows[0].source_link,canonical);
await assert.rejects(db.query(`select public.edit_ruby_link($1,0,'Stale','[]','','NFL',null,null,null,$2)`,[id,canonical]),/Card changed/);
// Older editor payloads retain a link rather than silently deleting it.
await db.query(`select public.edit_ruby($1,1,'Legacy edit','[]','','NFL',null,null,null)`,[id]);
assert.equal((await db.query(`select source_link from public.ruby_cards where id=$1`,[id])).rows[0].source_link,changed);
await assert.rejects(db.query(`select public.edit_ruby_link($1,2,'Empty','[]','','NFL',null,null,null,null)`,[id]),/check constraint/);
await submit('00000000-0000-4000-8000-000000000011');
// Unchanged legacy typed-leg submission is the third allowed daily slip.
await db.exec(`select public.submit_ruby('00000000-0000-4000-8000-000000000012','NFL','Legacy typed','["A over 1.5","B over 2.5"]','',null,null,null)`);
await assert.rejects(submit('00000000-0000-4000-8000-000000000013'),/three daily/);
const notifications=(await db.query('select count(*)::int n from public.notifications')).rows[0].n;
await submit(id);assert.equal((await db.query('select count(*)::int n from public.notifications')).rows[0].n,notifications);
await db.exec(`reset role;insert into public.member_blocks values('${b}','${a}');insert into auth.sessions values('00000000-0000-4000-8000-000000000099','${b}',now()+interval '1 day');set app.uid='${b}';set role authenticated;`);
assert.equal((await db.query('select count(*)::int n from public.ruby_cards')).rows[0].n,0);
await assert.rejects(submit('00000000-0000-4000-8000-000000000014'),/Contributor access/);
await db.exec('reset role;set role anon;');
await assert.rejects(submit('00000000-0000-4000-8000-000000000015'),/permission denied/);
await db.exec('reset role');
console.log('PASS Kalshi link normalization, direct-write denial, link-only retries/quota/revisions, immutable originals, notifications, legacy payloads and blocked readers');
await db.close();
