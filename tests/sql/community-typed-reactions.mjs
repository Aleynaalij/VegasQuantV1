import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [a,b,c,p,q] = [1,2,3,4,5].map(id);
const sql = path => fs.readFileSync(`supabase/migrations/${path}`,'utf8');
try {
await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema auth; create schema private;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,encrypted_password text,banned_until timestamptz);
 create function public.is_admin() returns boolean language sql as $$select false$$;
 -- Explicit fixture seam: tests exercise age denial through the actual new RPC/trigger.
 create function private.age_member_allowed() returns boolean language sql as $$select auth.uid() is not null and coalesce(current_setting('test.age',true),'on')<>'off'$$;
 create function private.age_eligible(uuid) returns boolean language sql as $$select coalesce(current_setting('test.age',true),'on')<>'off'$$;
 create table private.account_erasure_jobs(user_id uuid,expires_at timestamptz);
 create table public.community_profiles(user_id uuid,username text,avatar text,visible boolean);
 create table public.game_comments(id uuid,user_id uuid,body text);
 create table public.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid,endpoint text,p256dh text,auth text);
 create table public.app_updates(id uuid primary key,title text,body text,created_at timestamptz default now());
 create table public.app_update_reads(user_id uuid,update_id uuid,read_at timestamptz);
 grant usage on schema public,private,auth to authenticated;
 grant usage on schema public,auth to anon;
 insert into auth.users(id,email,email_confirmed_at) values('${a}','a@example.test',now()),('${b}','b@example.test',now()),('${c}','c@example.test',now());
 insert into public.community_profiles values('${a}','SampleAuthor','ruby',true),('${b}','SampleReader','ruby',true),('${c}','SampleOther','ruby',true);
 select set_config('test.uid','${a}',false);`);
await db.exec(sql('20261014025802_community_social_feed.sql'));
await db.exec(sql('20261014041536_launch_safety_controls.sql'));
await db.exec(`insert into public.community_posts(id,user_id,sport,kind,title,body) values('${p}','${a}','nfl','talk','Sample','Sample discussion');select set_config('test.uid','${c}',false);insert into public.community_posts(id,user_id,sport,kind,title,body) values('${q}','${c}','nfl','talk','Sample second','Sample second discussion');`);
await db.exec(sql('20261017015506_social_notification_system.sql').replace(/^select cron.schedule.*$/gm,''));
await db.exec(process.env.VQ_REACTION_MIGRATION ? fs.readFileSync(process.env.VQ_REACTION_MIGRATION,'utf8') : sql('20261103181103_community_typed_reactions.sql'));
const as = async user => db.exec(`reset role;set role authenticated;select set_config('test.uid','${user}',false);`);
const set = async choice => (await db.query('select public.set_community_reaction($1,$2) data',[p,choice])).rows[0].data;
const state = async () => (await db.query('select public.community_reaction_state($1) data',[p])).rows[0].data;
const owner = async statement => { await db.exec('reset role'); return db.exec(statement); };
const events = async () => { await db.exec('reset role'); return Number((await db.query('select count(*) n from private.notification_events')).rows[0].n); };
await as(c);await set('celebrate');assert.equal(await events(),0,'emoji must not emit a Like');
await as(c);await set(null);
await as(b);
let s=await set('heart');
assert.equal(s.mine,'heart');assert.equal(s.total,1);assert.equal(s.counts.heart,1);
assert.deepEqual(await set('heart'),s); // duplicate desired-state retry is not an unlike
const once=await events();assert.equal(once,1);
await as(b);s=await set('fire');assert.equal(s.mine,'fire');assert.equal(s.total,1);assert.equal(s.counts.heart,0);
assert.equal(await events(),once); // alternatives do not generate a false like
await as(b);await set('heart');assert.equal(await events(),once); // existing event key dedupes reselect
await as(c);await db.query('insert into public.community_reactions(post_id,user_id) values($1,$2)',[p,c]);
s=await state();assert.equal(s.mine,'heart');assert.equal(s.total,2);assert.equal(s.counts.heart,2);
await assert.rejects(db.query('update public.community_reactions set reaction_type=$1 where post_id=$2',['thinking',p]),/permission denied/);
await assert.rejects(db.query('insert into public.community_reactions(post_id,user_id,reaction_type) values($1,$2,$3)',[p,a,'fire']),/unavailable|row-level security/);
await assert.rejects(set('not-an-emoji'),/Unsupported reaction/);
const priorEvents=await events();
await owner(`insert into public.notification_preferences(user_id,disabled_types) values('${c}',array['like']) on conflict(user_id) do update set disabled_types=array['like'];`);
await as(b);await db.query('select public.set_community_reaction($1,$2)',[q,'heart']);
assert.equal(await events(),priorEvents,'declined Like preference must suppress notification creation');
await as(b);s=await set(null);assert.equal(s.mine,null);assert.equal(s.total,1);
assert.deepEqual(await set(null),s);
// Any insertion failure must restore the previous row and its notification/rate effects.
await set('thinking');
await owner(`create function private.test_reaction_failure() returns trigger language plpgsql as $$begin if new.reaction_type='fire' then raise exception 'synthetic write failed';end if;return new;end$$;
 create trigger z_test_reaction_failure before insert on public.community_reactions for each row execute function private.test_reaction_failure();`);
await as(b);await assert.rejects(set('fire'),/synthetic write failed/);
assert.equal((await state()).mine,'thinking');assert.equal((await state()).total,2);
await owner('drop trigger z_test_reaction_failure on public.community_reactions');
// Original rate trigger still applies to replacements.
await owner(`insert into private.notification_action_rates values('${b}',date_trunc('minute',now()),61) on conflict(user_id,window_at) do update set attempts=61;`);
await as(b);await assert.rejects(set('celebrate'),/Please wait/);assert.equal((await state()).mine,'thinking');
await owner(`delete from private.notification_action_rates where user_id='${b}';insert into public.member_blocks(user_id,target_user_id) values('${a}','${b}');`);
await as(b);assert.equal(await state(),null);await assert.rejects(set('heart'),/Post unavailable/);
await owner('delete from public.member_blocks');
await owner(`insert into public.member_blocks(user_id,target_user_id) values('${b}','${a}');`);
await as(b);assert.equal(await state(),null);await assert.rejects(set('heart'),/Post unavailable/);
await owner(`delete from public.member_blocks;insert into private.community_restrictions(user_id,reason) values('${b}','Sample restriction');`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner('delete from private.community_restrictions');
await as(b);await db.exec("select set_config('test.age','off',false)");
assert.equal(await state(),null);await assert.rejects(set('heart'),/unavailable/);
await db.exec("select set_config('test.age','on',false)");
await owner(`update auth.users set banned_until=now()+interval '1 day' where id='${b}';`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner(`update auth.users set banned_until=null where id='${b}';insert into private.account_erasure_jobs values('${b}',now()+interval '1 day');`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner('delete from private.account_erasure_jobs');
await as(b);await assert.rejects(db.query('select public.set_community_reaction($1,$2)',[id(99),'heart']),/Post unavailable/);
// An authenticated role without a signed-in actor is also denied.
await as('');assert.equal(await state(),null);await assert.rejects(set('heart'),/unavailable/);
// No visitor data, including aggregate counts, table metadata or RPC results.
await db.exec('reset role;set role anon');
await assert.rejects(db.query('select public.community_reaction_state($1)',[p]),/permission denied/);
await assert.rejects(db.query('select public.set_community_reaction($1,$2)',[p,'heart']),/permission denied/);
await assert.rejects(db.query('select count(*) from public.community_reactions'),/permission denied/);
await owner(`delete from public.community_posts where id='${p}';`);
await as(b);assert.equal(await state(),null);await assert.rejects(set('heart'),/Post unavailable/);
console.log('Typed reactions: real base RLS/safety/rate/notification triggers; old hearts, idempotence, choose/change/remove, counts, rollback, visitor/block/age/restriction/erasure/banned/missing/deleted denial PASS');
} finally { await db.close(); }
