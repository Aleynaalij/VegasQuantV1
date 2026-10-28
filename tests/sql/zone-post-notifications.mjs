import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003',p='00000000-0000-4000-8000-000000000004',comment='00000000-0000-4000-8000-000000000005';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
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
insert into public.community_profiles values('${a}','Alice',null,true),('${b}','Bob',null,true),('${c}','Carol',null,true);` .replace('grant select on public.community_post_comments,public.community_comment_reactions to authenticated;','grant select on public.community_post_comments to authenticated;'));
await db.exec(fs.readFileSync('supabase/migrations/20261017015506_social_notification_system.sql','utf8').replace(/^select cron.schedule.*$/gm,''));

// Same emitter type/importance patches the ruby migration applies before this one.
await db.exec(`alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check(type in ('like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','welcome','profile_reminder','security','password_change','account','feature','suggestion','contributor'));
alter table public.notifications drop constraint notifications_deep_link_check;
alter table public.notifications add constraint notifications_deep_link_check check(deep_link ~ '^/(community|notifications|membership|account|messages|feed)([/?#]|$)' and deep_link !~ '^//');`);
await db.exec(fs.readFileSync('supabase/migrations/20261028230000_zone_post_notifications.sql','utf8'));
await db.exec(`alter table public.community_posts add column title text`);
const d='00000000-0000-4000-8000-000000000006',post2='00000000-0000-4000-8000-000000000007';
await db.exec(`insert into auth.users values('${d}','d@example.com',null,'old');insert into public.community_profiles values('${d}','Dan',null,true);
insert into public.member_blocks values('${b}','${a}');
insert into public.notification_preferences(user_id,push_enabled) values('${c}',true);insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${c}','https://push.example/c','k','a');`);
await db.exec(`insert into public.community_posts(id,user_id,sport,body) values('${p}','${a}','nfl','Hammering the over tonight @Bob')`);
const rows=(await db.query(`select recipient_id,type,priority,message,deep_link,post_id from public.notifications order by type`)).rows;
const posts=rows.filter(r=>r.type==='post');
// Carol only: Alice is the author, Bob blocked Alice (and was mentioned), Dan is unconfirmed.
assert.deepEqual(posts.map(r=>r.recipient_id),[c]);
assert.equal(posts[0].priority,'medium');
assert.match(posts[0].message,/^posted in The Zone: Hammering the over/);
assert.equal(posts[0].deep_link,`/community?sport=nfl&post=${p}#post-${p}`);
assert.equal(posts[0].post_id,p);
// Medium priority queues one batched push for a member who opted in.
assert.equal((await db.query(`select count(*)::int n from private.notification_deliveries where channel='push'`)).rows[0].n,1);
// A mentioned member gets the mention only, not a duplicate 'post'.
await db.exec(`delete from public.member_blocks;insert into public.community_posts(id,user_id,sport,body) values('${post2}','${a}','nba','Anyone on the Knicks? @Bob')`);
const second=(await db.query(`select recipient_id,type from public.notifications where post_id='${post2}' order by recipient_id,type`)).rows;
assert.deepEqual(second,[{recipient_id:b,type:'mention'},{recipient_id:c,type:'post'}]);
// Opting out of 'post' stops them.
await db.exec(`update public.notification_preferences set disabled_types='{post}' where user_id='${c}';insert into public.community_posts(id,user_id,sport,body) values(gen_random_uuid(),'${a}','nfl','Late game thoughts')`);
assert.equal((await db.query(`select count(*)::int n from public.notifications where type='post' and recipient_id='${c}'`)).rows[0].n,2);
await assert.rejects(db.query(`insert into public.notifications(recipient_id,actor_name,type,message,priority,deep_link,group_key) values('${c}','x','bogus','m','low','/community','k')`));
console.log('PASS Zone posts notify every other eligible member once (blocks, unconfirmed, author, mentions, opt-out honored) and queue a batched push');
await db.close();
