import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [a,b,c,p,q] = [1,2,3,4,5].map(id);
const sql = path => fs.readFileSync(`supabase/migrations/${path}`,'utf8');
const VIEW = "create or replace view public.ruby_cards with(security_invoker=true) as\nselect s.id,s.user_id,s.brand,s.theme,s.submission_day,coalesce(r.sport,s.sport) sport,coalesce(r.title,s.title) title,coalesce(r.legs,s.legs) legs,coalesce(r.note,s.note) note,case when r.id is null then s.photo_path else r.photo_path end photo_path,case when r.id is null then s.sportsbook else r.sportsbook end sportsbook,case when r.id is null then s.reported_odds else r.reported_odds end reported_odds,s.created_at,coalesce(r.revision,0) revision,r.created_at edited_at,\ncoalesce(v.hidden,false) hidden,case when rr.revision=coalesce(r.revision,0) then rr.outcome else null end reported_result\nfrom public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true\nleft join lateral(select * from public.ruby_visibility_events where submission_id=s.id order by created_at desc,id desc limit 1) v on true\nleft join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) rr on true\nwhere not coalesce(v.hidden,false) or (select public.is_admin());";
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
await db.exec(sql('20261103181103_community_typed_reactions.sql'));

const [k,h]=[6,7].map(id);
await db.exec(`reset role;
 create table public.ruby_submissions(id uuid primary key,user_id uuid,brand text,theme text,submission_day date default current_date,sport text,title text,legs jsonb default '[]',note text default '',photo_path text,sportsbook text,reported_odds integer,created_at timestamptz default now());
 create table public.ruby_card_revisions(id uuid primary key default gen_random_uuid(),submission_id uuid references public.ruby_submissions on delete cascade,revision integer,sport text,title text,legs jsonb,note text,photo_path text,sportsbook text,reported_odds integer,created_at timestamptz default now());
 create table public.ruby_visibility_events(id uuid primary key default gen_random_uuid(),submission_id uuid references public.ruby_submissions on delete cascade,hidden boolean,created_at timestamptz default now());
 create table public.ruby_result_reports(id uuid primary key default gen_random_uuid(),submission_id uuid references public.ruby_submissions on delete cascade,revision integer,outcome text,reported_at timestamptz default now());
 insert into public.ruby_submissions(id,user_id,brand,theme,sport,title) values('${k}','${a}','OmaticsZone','orbit','NFL','Sample lay'),('${h}','${a}','OmaticsZone','orbit','NFL','Sample hidden lay');
 insert into public.ruby_visibility_events(submission_id,hidden) values('${h}',true);`);
await db.exec(VIEW);
await db.exec(process.env.VQ_CARD_MIGRATION ? fs.readFileSync(process.env.VQ_CARD_MIGRATION,'utf8') : sql('20261104015613_ruby_card_reactions.sql'));
const as = async user => db.exec(`reset role;set role authenticated;select set_config('test.uid','${user}',false);`);
const owner = async statement => { await db.exec('reset role'); return db.exec(statement); };
const set = async (choice,card=k) => (await db.query('select public.set_ruby_card_reaction($1,$2) data',[card,choice])).rows[0].data;
const states = async ids => (await db.query('select public.ruby_card_reaction_states($1::uuid[]) data',[ids])).rows[0].data;
const events = async () => { await db.exec('reset role'); return Number((await db.query('select count(*) n from private.notification_events')).rows[0].n); };
const zero={heart:0,celebrate:0,fire:0,thinking:0};
await as(b);
assert.deepEqual(await states([k]),[{version:1,post_id:k,total:0,counts:zero,mine:null}]);
let s=await set('heart');
assert.equal(s.mine,'heart');assert.equal(s.total,1);assert.equal(s.counts.heart,1);assert.equal(s.post_id,k);
assert.deepEqual(await set('heart'),s,'a repeated desired state is not an unlike');
s=await set('fire');assert.equal(s.mine,'fire');assert.equal(s.total,1);assert.equal(s.counts.heart,0);assert.equal(s.counts.fire,1);
await as(c);s=await set('celebrate');assert.equal(s.mine,'celebrate');assert.equal(s.total,2);
await as(b);[s]=await states([k,h,id(99)]);assert.equal(s.mine,'fire');assert.equal(s.total,2);
assert.equal((await states([k,h,id(99)])).length,1,'hidden and missing cards return no state');
await assert.rejects(set('heart',h),/Card unavailable/);
await assert.rejects(set('heart',id(99)),/Card unavailable/);
await assert.rejects(set('not-an-emoji'),/Unsupported reaction/);
await assert.rejects(states(Array.from({length:51},(_,i)=>id(100+i))),/Too many cards/);
assert.equal(await events(),0,'lay reactions never notify');
// Members have no direct table access: reads and writes go only through the functions.
await as(b);
await assert.rejects(db.query('select count(*) from public.ruby_card_reactions'),/permission denied/);
await assert.rejects(db.query('insert into public.ruby_card_reactions(card_id,user_id) values($1,$2)',[k,b]),/permission denied/);
await assert.rejects(db.query('update public.ruby_card_reactions set reaction_type=$1',['heart']),/permission denied/);
await assert.rejects(db.query('delete from public.ruby_card_reactions'),/permission denied/);
// A failed insert restores the previous choice.
await owner(`create function private.test_card_failure() returns trigger language plpgsql as $$begin if new.reaction_type='thinking' then raise exception 'synthetic write failed';end if;return new;end$$;
 create trigger z_test_card_failure before insert on public.ruby_card_reactions for each row execute function private.test_card_failure();`);
await as(b);await assert.rejects(set('thinking'),/synthetic write failed/);
assert.equal((await states([k]))[0].mine,'fire');
await owner('drop trigger z_test_card_failure on public.ruby_card_reactions');
// The shared 60-a-minute reaction/follow rate limit applies.
await owner(`insert into private.notification_action_rates values('${b}',date_trunc('minute',now()),61) on conflict(user_id,window_at) do update set attempts=61;`);
await as(b);await assert.rejects(set('heart'),/Please wait/);assert.equal((await states([k]))[0].mine,'fire');
await owner(`delete from private.notification_action_rates where user_id='${b}';`);
// Same member gate as post reactions.
await owner(`insert into private.community_restrictions(user_id,reason) values('${b}','Sample restriction');`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner('delete from private.community_restrictions');
await as(b);await db.exec("select set_config('test.age','off',false)");
assert.equal(await states([k]),null);await assert.rejects(set('heart'),/unavailable/);
await db.exec("select set_config('test.age','on',false)");
await owner(`update auth.users set banned_until=now()+interval '1 day' where id='${b}';`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner(`update auth.users set banned_until=null where id='${b}';update auth.users set email_confirmed_at=null where id='${c}';`);
await as(c);await assert.rejects(set(null),/unavailable/);
await owner(`update auth.users set email_confirmed_at=now() where id='${c}';insert into private.account_erasure_jobs values('${b}',now()+interval '1 day');`);
await as(b);await assert.rejects(set('heart'),/unavailable/);
await owner('delete from private.account_erasure_jobs');
await as('');assert.equal(await states([k]),null);await assert.rejects(set('heart'),/unavailable/);
// Visitors get nothing, not even counts.
await db.exec('reset role;set role anon');
await assert.rejects(states([k]),/permission denied/);
await assert.rejects(set('heart'),/permission denied/);
await assert.rejects(db.query('select count(*) from public.ruby_card_reactions'),/permission denied/);
// Removing works; hiding a lay later hides its state and blocks changes; deleting cascades.
await as(b);s=await set(null);assert.equal(s.mine,null);assert.equal(s.total,1);assert.deepEqual(await set(null),s);
await owner(`insert into public.ruby_visibility_events(submission_id,hidden) values('${k}',true);`);
await as(c);assert.deepEqual(await states([k]),[]);await assert.rejects(set(null),/Card unavailable/);
await owner(`delete from public.ruby_submissions where id='${k}';`);
await owner('select 1');assert.equal(Number((await db.query('select count(*) n from public.ruby_card_reactions')).rows[0].n),0);
console.log('Lay reactions: choose/change/remove, idempotence, canonical counts, hidden/missing, rollback, rate limit, no notifications, member gate, visitor and direct-table denial, cascade PASS');
} finally { await db.close(); }
