// Synthetic fixtures only; real migration composition, no production connection.
// Deliberate seams: prerequisite table schemas are minimal; cron/HTTP not executed;
// Ruby recent-comment helper is false because this suite only creates posts.
// PGlite is single-session: simultaneous-result coverage is sequential same-window calls,
// not a proof of multi-connection PostgreSQL races. Card trigger seam is tested last under
// an authenticator/service_role session; full editorial publisher behavior is out of scope.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const sql=(path)=>fs.readFileSync(new URL(path,root),'utf8');
import assert from 'node:assert/strict';
import test from 'node:test';
await test('Dealer Zone and followed-actor contracts (synthetic database)',async(t)=>{
const db=new PGlite();t.after(()=>db.close());
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003',p='00000000-0000-4000-8000-000000000004',comment='00000000-0000-4000-8000-000000000005';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
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
await db.exec(sql('supabase/migrations/20261017015506_social_notification_system.sql').replace(/^select cron.schedule.*$/gm,''));

// Compose actual age and membership definitions over synthetic prerequisite tables.
await db.exec(`create table auth.sessions(id uuid,user_id uuid,not_after timestamptz);
create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('session_id',current_setting('app.session',true),'aal','aal2')$$;
create table private.age_policy(singleton boolean,enforced boolean,version int);
create table private.age_checks(user_id uuid,state text,policy_version int);
create table private.admin_users(user_id uuid);
create table private.memberships(user_id uuid,revoked_at timestamptz,starts_at timestamptz,expires_at timestamptz);
create table private.billing_subscriptions(user_id uuid,blocked boolean,paid_until timestamptz);
insert into private.age_policy values(true,true,1);`);
const functionFrom=(file,name)=>{const text=sql(file);const start=text.indexOf('function '+name+'(');const begin=text.lastIndexOf('create ',start);const end=text.indexOf('$$;',start)+3;assert.ok(start>=0&&end>start);return text.slice(begin,end).replace(/^create function/,'create or replace function');};
await db.exec(functionFrom('supabase/migrations/20260930133259_membership_and_payments.sql','private.is_admin'));
await db.exec(functionFrom('supabase/migrations/20261001124054_subscription_billing.sql','private.has_membership'));
await db.exec(functionFrom('supabase/migrations/20261014103812_verified_age_gate.sql','private.age_eligible'));
await db.exec(functionFrom('supabase/migrations/20261014103812_verified_age_gate.sql','private.age_member_allowed'));
const age=sql('supabase/migrations/20261014103812_verified_age_gate.sql');
const wrap=age.indexOf('do $$declare f record;args');await db.exec(age.slice(wrap,age.indexOf('end $$;',wrap)+7));
const ruby=sql('supabase/migrations/20261023210220_ruby_contributor_cards.sql');
await db.exec(ruby.slice(ruby.indexOf('alter table public.notifications drop constraint'),ruby.indexOf('create function private.ruby_notify')));
const zone=sql('supabase/migrations/20261028230000_zone_post_notifications.sql');await db.exec(zone.slice(0,zone.indexOf('create function private.zone_post_notify')));
const live=sql('supabase/migrations/20261101100000_live_pick_alerts.sql');await db.exec(live.slice(0,live.indexOf('-- One row per decided pick')));

await db.exec(`insert into private.age_checks select id,'verified',1 from auth.users;
insert into auth.sessions values('00000000-0000-4000-8000-000000000011','${a}',now()+interval '1 day');
insert into private.memberships values('${a}',null,now()-interval '1 day',now()+interval '1 day');
insert into private.admin_users values('${c}');set request.jwt.claim.sub='${a}';set app.session='00000000-0000-4000-8000-000000000011';`);
// Recovered deployed dependency is loaded from source below; identity rows remain synthetic.
// Complete recovery migrations are separately executed by dealer-publisher-recovery.mjs.
const dealer='00000000-0000-4000-8000-000000000020';
await db.exec(`alter table auth.users add column phone text,add column raw_app_meta_data jsonb,add column banned_until timestamptz;
create table private.zone_automation(name text primary key,user_id uuid);
insert into auth.users(id,raw_app_meta_data,banned_until) values('${dealer}','{"publisher":"vq_dealer"}','infinity');
insert into private.zone_automation values('vq_dealer','${dealer}');
insert into public.community_profiles values('${dealer}','TheDealer','synthetic-avatar',true);
update public.community_profiles set avatar='synthetic-avatar';
alter table public.community_posts alter column id set default gen_random_uuid();
alter table public.community_posts add column kind text default 'talk',add column title text default 'Test',add column legs jsonb default '[]',add column photo_path text,add column author_name text,add column created_at timestamptz default now(),add column card text;
create schema storage;create table storage.objects(bucket_id text,name text,owner_id text);
create function private.recent_ruby_card_comment() returns boolean language sql as $$select false$$;
create table public.nba_games(id uuid primary key default gen_random_uuid(),provider_id text,slug text,tipoff timestamptz);
create table public.nba_editorial_picks(id uuid primary key default gen_random_uuid(),game_id uuid,player text,market text,direction text,line numeric,supersedes_id uuid);
create table public.sports_games(id uuid primary key default gen_random_uuid(),sport text,provider_id text,slug text,start_time timestamptz);
create table public.sports_markets(id uuid primary key default gen_random_uuid(),payload jsonb);
create table public.sports_selections(id uuid primary key default gen_random_uuid(),game_id uuid,market_id uuid);
grant usage on schema private,auth to service_role;
grant select,insert on public.community_posts to authenticated;
grant select on public.community_profiles to authenticated;`);
await db.exec(functionFrom('supabase/migrations/20261106221738_dealer_profile_visibility.sql','private.is_dealer_publisher'));
await db.exec('revoke all on function private.is_dealer_publisher(uuid) from public,anon,authenticated,service_role');
await db.exec(functionFrom('supabase/migrations/20261104031500_ruby_card_comments.sql','private.prepare_member_publication'));
await db.exec(functionFrom('supabase/migrations/20261014041536_launch_safety_controls.sql','private.community_safety_check'));
await db.exec(`create trigger prepare_community_post before insert on public.community_posts for each row execute function private.prepare_member_publication();
create trigger safety_post before insert on public.community_posts for each row execute function private.community_safety_check();`);
await db.exec(live.slice(live.indexOf('-- One row per decided pick'),live.indexOf('-- Every two minutes')));
await db.exec(`create schema net;create schema vault;
create table private.synthetic_http_calls(url text);create table private.push_config(dispatch_secret uuid);create table vault.decrypted_secrets(id uuid,decrypted_secret text);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$begin insert into private.synthetic_http_calls values(url);return 1;end$$;`);
await db.exec(functionFrom('supabase/migrations/20261101100000_live_pick_alerts.sql','private.invoke_live_pick_alerts'));
await db.exec(sql('supabase/migrations/20261103113707_notification_access_contracts.sql'));
await db.exec(functionFrom('supabase/migrations/20261029001000_nba_three_point_volume.sql','private.zone_post_notify'));
await db.exec('create trigger zone_post_notify after insert on public.community_posts for each row execute function private.zone_post_notify()');
const q=async(s,args=[])=> (await db.query(s,args)).rows;
const one=async(s,args=[])=> (await q(s,args))[0];
let seq=0;
const emit=async(actor,type='comment',key=`event-${++seq}`,content=null)=>(await one("select private.emit_notification($1,$2,$3,$4,$5,null,null,'Synthetic event','/notifications') id",[a,actor,type,key,content])).id;
const asMember=async(f)=>{await db.exec(`set request.jwt.claim.sub='${a}';set role authenticated`);try{return await f();}finally{await db.exec('reset role');}};
const visible=async(id)=>asMember(async()=>!!(await one('select id from public.notifications where id=$1',[id])));
const follow=async(actor)=>db.query('insert into public.member_follows(user_id,target_user_id) values($1,$2) on conflict do nothing',[a,actor]);
const unfollow=async(actor)=>db.query('delete from public.member_follows where user_id=$1 and target_user_id=$2',[a,actor]);
// Create one legacy mixed projection and historical alert before applying the new migration.
const shared='00000000-0000-4000-8000-000000000099';
const legacy=await emit(b,'like','legacy-b',shared);assert.equal(await emit(c,'like','legacy-c',shared),legacy);
const historic='00000000-0000-4000-8000-000000000098';
await db.query("insert into private.live_pick_alerts(pick_id,sport,message) values($1,'nhl','Historical result')",[historic]);
// Migration-order integration seam: install the original follow/profile owner-read policies on
// minimal fixture tables and the unchanged restrictive age policy; no production gate bypass.
await db.exec(`alter table public.member_follows enable row level security;
alter table public.community_profiles enable row level security;
grant select,insert,delete on public.member_follows to authenticated;`);
const social=sql('supabase/migrations/20261014025802_community_social_feed.sql');
for(const name of ['member_follows_read','member_follows_insert','member_follows_delete']) {
 const statement=social.split('\n').find(line=>line.startsWith('create policy '+name+' '));assert.ok(statement);await db.exec(statement);
}
const profilePolicy=sql('supabase/migrations/20261003112128_community_profiles.sql').split('\n').find(line=>line.startsWith('create policy own_profile_read '));
assert.ok(profilePolicy);await db.exec(profilePolicy);
for(const table of ['member_follows','community_profiles']) await db.exec(`create policy age_verified_account on public.${table} as restrictive for all to authenticated using((select private.age_member_allowed())) with check((select private.age_member_allowed()))`);
await db.exec(sql('supabase/migrations/20261109030000_member_follows_any_profile.sql'));
await db.exec(sql('supabase/migrations/20261109032951_dealer_zone_follow_notifications.sql'));

await t.test('no replay, exact Dealer identity and restricted helper ACLs',async()=>{
 assert.equal((await one('select count(*)::int n from public.community_posts')).n,0);
 assert.equal((await one('select zone_post_id from private.live_pick_alerts where pick_id=$1',[historic])).zone_post_id,null);
 assert.equal((await one('select private.is_dealer_publisher($1) ok',[dealer])).ok,true);
 assert.equal((await one('select private.is_dealer_publisher($1) ok',[c])).ok,false);
 for(const role of ['anon','authenticated','service_role']) for(const fn of ['private.post_live_pick_result(uuid)','private.is_live_pick_zone_post(public.community_posts)','private.notification_actor_followed(uuid,uuid,text)','private.notification_group_followed(uuid,uuid,uuid,text)'])
  assert.equal((await one('select has_function_privilege($1,$2,\'execute\') ok',[role,fn])).ok,false,`${role} cannot call ${fn}`);
 assert.equal((await one("select has_function_privilege('service_role','public.live_pick_alert(text,uuid,text,text)','execute') ok")).ok,true);
});
await t.test('every actor-bearing event needs a follow; Dealer only exception; system notices survive',async()=>{
 for(const type of ['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','post','contributor']) {
  assert.equal(await emit(b,type),null,`${type}: non-followed author`);
  assert.equal(await emit(c,type),null,`${type}: unrelated admin`);
  assert.ok(await emit(dealer,type),`${type}: Dealer`);
 }
 await follow(b);
 for(const type of ['like','comment','reply','mention','follow','share','comment_reaction','message','group_message','message_request','message_reminder','post','contributor']) assert.ok(await emit(b,type),`${type}: followed author`);
 await unfollow(b);
 for(const type of ['security','password_change','account']) assert.ok(await emit(b,type),type);
 assert.ok(await emit(null,'feature'));
});
await t.test('legacy mixed groups and new single-actor groups follow current relationships in RLS',async()=>{
 await follow(c);assert.equal(await visible(legacy),false,'last actor followed does not expose earlier actor');
 await follow(b);assert.equal(await visible(legacy),true);
 const x=await emit(b,'like','new-b',shared),y=await emit(c,'like','new-c',shared);
 assert.notEqual(x,y);assert.notEqual(x,legacy);
 await unfollow(b);assert.equal(await visible(x),false);assert.equal(await visible(y),true);assert.equal(await visible(legacy),false);
 const inbox=await asMember(()=>one('select notification_inbox() data'));
 assert.equal(inbox.data.items.some(i=>i.id===legacy||i.id===x),false);
 const counts=await asMember(()=>one('select notification_counts() data'));
 const actual=await asMember(()=>one('select count(*)::int n from public.notifications where read_at is null'));
 assert.equal(counts.data.unread,actual.n);
 await follow(b);
});
await t.test('latest-main profile follow allows a confirmed member without posts through authenticated RLS',async()=>{
 await unfollow(b);
 assert.equal((await one('select count(*)::int n from public.community_posts where user_id=$1',[b])).n,0);
 assert.equal((await asMember(()=>q('select user_id from public.community_profiles where user_id=$1',[b]))).length,0,'target profile remains owner-read');
 assert.equal((await one('select private.has_membership() ok')).ok,true,'existing membership fixture retained');
 assert.equal(await emit(b,'message','pre-profile-follow'),null);
 const memberFollow=()=>asMember(()=>db.query('insert into public.member_follows(user_id,target_user_id) values($1,$2)',[a,b]));
 await db.exec(`update public.community_profiles set visible=false where user_id='${b}'`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`update public.community_profiles set visible=true where user_id='${b}';update auth.users set email_confirmed_at=null where id='${b}'`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`update auth.users set email_confirmed_at=now(),banned_until='infinity' where id='${b}'`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`update auth.users set banned_until=null where id='${b}';insert into public.member_blocks values('${a}','${b}')`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`delete from public.member_blocks;delete from private.age_checks where user_id='${a}'`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`insert into private.age_checks values('${a}','verified',1);update auth.sessions set not_after=now()-interval '1 second' where user_id='${a}'`);await assert.rejects(memberFollow(),/row-level security/);
 await db.exec(`update auth.sessions set not_after=now()+interval '1 day' where user_id='${a}'`);
 await assert.rejects(asMember(()=>db.query('insert into public.member_follows(user_id,target_user_id) values($1,$1)',[a])),/row-level security/);
 await assert.rejects(asMember(()=>db.query('insert into public.member_follows(user_id,target_user_id) values($1,$2)',[c,b])),/row-level security/);
 await memberFollow();
 const notification=await emit(b,'message','post-profile-follow');assert.ok(notification);assert.equal(await visible(notification),true);
 await asMember(()=>db.query('delete from public.member_follows where user_id=$1 and target_user_id=$2',[a,b]));
 assert.equal(await visible(notification),false);assert.equal(await emit(b,'message','after-profile-unfollow'),null);
 await follow(b);
});
await t.test('consent, block, age, erasure and protected-pick access remain enforced',async()=>{
 await db.exec(`insert into public.notification_preferences(user_id) values('${a}') on conflict do nothing;
 update public.notification_preferences set disabled_types=array['post'] where user_id='${a}';`);
 assert.equal(await emit(dealer,'post'),null);
 await db.exec(`update public.notification_preferences set disabled_types='{}' where user_id='${a}';insert into public.member_blocks values('${a}','${dealer}');`);
 assert.equal(await emit(dealer,'comment'),null);
 await db.exec(`delete from public.member_blocks;delete from private.age_checks where user_id='${a}'`);
 assert.equal(await emit(dealer,'comment'),null);assert.equal(await emit(null,'pick'),null);
 await db.exec(`insert into private.age_checks values('${a}','verified',1);update private.memberships set expires_at=now()-interval '1 second' where user_id='${a}'`);
 assert.equal(await emit(null,'pick'),null);
 await db.exec(`update private.memberships set expires_at=now()+interval '1 day' where user_id='${a}';insert into private.account_erasure_jobs values('${a}',now()+interval '1 day')`);
 assert.equal(await emit(null,'pick'),null);
 await db.exec('delete from private.account_erasure_jobs');
 assert.ok(await emit(null,'pick'));
});
await t.test('pending and active leased deliveries recheck follow and channel consent',async()=>{
 await db.exec(`delete from public.notifications;update public.notification_preferences set push_enabled=true where user_id='${a}';insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${a}','https://example.invalid/synthetic','synthetic','synthetic');`);
 const id=await emit(b,'message');await db.exec("update private.notification_deliveries set due_at=now()-interval '1 second'");
 let jobs=(await one('select claim_social_notification_deliveries() jobs')).jobs;const job=jobs.find(j=>j.notification_id===id);assert.ok(job);
 const allowed=async()=>(await one('select social_notification_delivery_allowed($1,$2) ok',[job.id,job.lease])).ok;
 assert.equal(await allowed(),true);await unfollow(b);assert.equal(await allowed(),false);
 await db.query('select claim_social_notification_deliveries()');
 assert.equal((await one('select state from private.notification_deliveries where id=$1',[job.id])).state,'leased','active lease ownership preserved');
 await follow(b);assert.equal(await allowed(),true);
 await db.exec(`update public.notification_preferences set push_enabled=false where user_id='${a}'`);assert.equal(await allowed(),false);
 await db.exec(`update public.notification_preferences set push_enabled=true where user_id='${a}'`);
 const pending=await emit(b,'message');await unfollow(b);await db.exec("update private.notification_deliveries set due_at=now()-interval '1 second'");
 jobs=(await one('select claim_social_notification_deliveries() jobs')).jobs;assert.equal(jobs.some(j=>j.notification_id===pending),false);
 assert.equal((await one('select state from private.notification_deliveries where notification_id=$1',[pending])).state,'suppressed');
 await follow(b);
});
await t.test('legacy mixed delivery, search and foreign-owner read fail closed after unfollow',async()=>{
 await db.exec('delete from public.notifications');
 const id=await emit(c,'message');
 await db.query("insert into private.notification_events(recipient_id,event_key,type,actor_id,notification_id) values($1,'mixed-delivery-earlier','message',$2,$3)",[a,b,id]);
 await db.exec("update private.notification_deliveries set due_at=now()-interval '1 second'");
 const jobs=(await one('select claim_social_notification_deliveries() jobs')).jobs,job=jobs.find(x=>x.notification_id===id);assert.ok(job);
 await unfollow(b);
 assert.equal((await one('select social_notification_delivery_allowed($1,$2) ok',[job.id,job.lease])).ok,false);
 const search=await asMember(()=>one("select notification_inbox(null,'Synthetic') data"));assert.equal(search.data.items.some(x=>x.id===id),false);
 await follow(b);
 await db.exec(`set request.jwt.claim.sub='${b}';set role authenticated`);
 try {assert.equal((await q('select id from public.notifications where id=$1',[id])).length,0);}finally{await db.exec(`reset role;set request.jwt.claim.sub='${a}'`);}
 await db.query("update private.notification_deliveries set lease_until=now()-interval '1 second',due_at=now()-interval '1 second' where id=$1",[job.id]);
 await unfollow(b);await db.query('select claim_social_notification_deliveries()');
 assert.equal((await one('select state from private.notification_deliveries where id=$1',[job.id])).state,'suppressed');await follow(b);
});
await t.test('existing noncritical notification flood limit remains for Dealer',async()=>{
 await db.query('delete from private.notification_events where actor_id=$1 and recipient_id=$2',[dealer,a]);
 for(let i=0;i<20;i++) assert.ok(await emit(dealer,'comment',`rate-${i}`));
 assert.equal(await emit(dealer,'comment','rate-21'),null);
 assert.ok(await emit(dealer,'message','critical-not-rate-limited'));
});
const game=(await one("insert into public.sports_games(sport,slug,start_time) values('nhl','synthetic-game',now()-interval '1 hour') returning id")).id;
const newPick=async()=>(await one('insert into public.sports_selections(game_id) values($1) returning id',[game])).id;
const retry=async()=>(await one('select public.retry_live_pick_zone_posts() result')).result;
const accept=async(id,message)=>one("select public.live_pick_alert('nhl',$1,$2,'/nhl/games/synthetic-game') n",[id,message]);
// Separate auto-committed RPC calls mirror the API's accept-then-drain phases.
// Most publication cases use this convenience; queue-only cancellation is tested explicitly.
const alert=async(id,message)=>{const accepted=await accept(id,message);await retry();return accepted;};
const settings=async()=>one("select current_setting('request.jwt.claim.sub',true) sub,current_setting('request.jwt.claims',true) claims,current_setting('vq.automated_post',true) automated");
await t.test('clear and miss results post once, verbatim, together, without duplicate notifications or changed sessions',async()=>{
 await db.exec(`set request.jwt.claim.sub='${a}';set request.jwt.claims='{"sub":"${a}","role":"authenticated"}';set vq.automated_post='off';delete from public.notifications;`);
 const before=await settings();
 const messages=['Synthetic Over cleared (3rd 5:12): 7 total, cleared.','Synthetic Under missed (final): 7 total.','@Alice pushed (final): 6 total.'];
 for(const message of messages){
  const id=await newPick();await alert(id,message);assert.deepEqual(await settings(),before);
  const row=await one('select p.* from public.community_posts p join private.live_pick_alerts a on a.zone_post_id=p.id where a.pick_id=$1',[id]);
  assert.equal(row.body,message);assert.equal(row.user_id,dealer);assert.equal(row.author_name,'TheDealer');assert.equal(row.kind,'talk');
  assert.equal((await alert(id,message)).n,0);
  assert.equal((await one('select count(*)::int n from public.community_posts where id=$1',[row.id])).n,1);
 }
 assert.equal((await one("select count(*)::int n from public.notifications where type<>'pick'")).n,0,'no post or mention duplicates');
 assert.equal((await one("select count(*)::int n from public.community_posts")).n,3);
 assert.equal((await one('select count(*)::int n from private.live_pick_alerts where pick_id=$1 and zone_post_id is null',[historic])).n,1);
});
const health=async()=>(await one('select public.live_pick_zone_health() result')).result;
const due=async(id)=>db.query("update private.live_pick_alerts set zone_next_attempt_at=now()-interval '1 second' where pick_id=$1",[id]);
await t.test('queue-only acceptance survives separately canceled Zone publication batch',async()=>{
 const id=await newPick(),before=await settings();
 await db.exec(`create function private.synthetic_zone_cancel() returns trigger language plpgsql as $$begin if new.body='Synthetic timeout result' then raise exception 'Synthetic Zone timeout' using errcode='57014';end if;return new;end$$;
 create trigger synthetic_zone_cancel before insert on public.community_posts for each row execute function private.synthetic_zone_cancel();`);
 const accepted=await accept(id,'Synthetic timeout result');assert.ok(accepted.n>0);
 const queued=()=>one('select zone_status,zone_attempts,zone_next_attempt_at<=now() due,zone_post_id from private.live_pick_alerts where pick_id=$1',[id]);
 assert.deepEqual(await queued(),{zone_status:'pending',zone_attempts:0,due:true,zone_post_id:null},'acceptance does not enter any Zone trigger');
 const counts=()=>one('select (select count(*)::int from public.notifications where content_id=$1) notifications,(select count(*)::int from private.notification_deliveries where notification_id in(select id from public.notifications where content_id=$1)) deliveries',[id]);
 const original=await counts();assert.ok(original.notifications>0);assert.ok(original.deliveries>0);
 await assert.rejects(retry(),e=>e.code==='57014' && /Synthetic Zone timeout/.test(e.message));
 // Canceled retry statements roll back attempts as well as post writes, so the row remains due.
 assert.deepEqual(await queued(),{zone_status:'pending',zone_attempts:0,due:true,zone_post_id:null});
 assert.deepEqual(await counts(),original);assert.deepEqual(await settings(),before);
 assert.equal((await accept(id,'Ignored duplicate text')).n,0);
 await db.exec('drop trigger synthetic_zone_cancel on public.community_posts');
 const result=await retry();assert.equal(result.posted,1);
 const done=await queued();assert.equal(done.zone_status,'posted');assert.equal(done.zone_attempts,1);assert.ok(done.zone_post_id);
 assert.equal((await one('select body from public.community_posts where id=$1',[done.zone_post_id])).body,'Synthetic timeout result');
 assert.deepEqual(await counts(),original);assert.equal((await retry()).attempted,0);
});
await t.test('publication failure preserves original alert and settings; delayed retry posts exactly once',async()=>{
 const id=await newPick(),before=await settings();
 await db.exec(`update public.community_profiles set visible=false where user_id='${dealer}'`);
 assert.ok((await alert(id,'Synthetic cleared')).n>0);
 let row=await one('select * from private.live_pick_alerts where pick_id=$1',[id]);
 assert.equal(row.zone_status,'pending');assert.equal(row.zone_attempts,1);assert.equal(row.zone_post_id,null);assert.match(row.zone_last_error,/Complete and enable/);
 assert.deepEqual(await settings(),before);
 const snapshots=async()=>one('select (select count(*)::int from public.notifications where content_id=$1) notifications,(select count(*)::int from private.notification_events where notification_id in(select id from public.notifications where content_id=$1)) events,(select count(*)::int from private.notification_deliveries where notification_id in(select id from public.notifications where content_id=$1)) deliveries',[id]);
 const original=await snapshots();assert.ok(original.notifications>0);assert.ok(original.deliveries>0);
 const next=row.zone_next_attempt_at;assert.equal((await alert(id,'Different retry text')).n,0);
 row=await one('select * from private.live_pick_alerts where pick_id=$1',[id]);assert.deepEqual(row.zone_next_attempt_at,next);assert.equal(row.zone_attempts,1);
 assert.equal((await retry()).attempted,0,'backoff is respected');
 await db.exec(`update public.community_profiles set visible=true where user_id='${dealer}';update public.sports_games set start_time=now()-interval '7 hours' where id='${game}'`);
 await due(id);assert.equal((await retry()).posted,1,'retry survives original six-hour candidate window');
 row=await one('select * from private.live_pick_alerts where pick_id=$1',[id]);assert.equal(row.zone_status,'posted');assert.equal(row.zone_attempts,2);
 assert.equal((await one('select body from public.community_posts where id=$1',[row.zone_post_id])).body,'Synthetic cleared');
 assert.deepEqual(await snapshots(),original);assert.equal((await retry()).attempted,0);assert.deepEqual(await settings(),before);
 await db.query('delete from public.community_posts where id=$1',[row.zone_post_id]);
 assert.equal((await retry()).attempted,0,'deleted terminal post is not republished');
 assert.equal((await one('select zone_status from private.live_pick_alerts where pick_id=$1',[id])).zone_status,'posted');
 await db.exec(`update public.sports_games set start_time=now()-interval '1 hour' where id='${game}'`);
 await asMember(()=>db.query("insert into public.community_posts(user_id,sport,kind,title,body) values($1,'nhl','talk','Ordinary','Ordinary member post')",[a]));
 await assert.rejects(asMember(()=>db.query("insert into public.community_posts(user_id,sport,body) values($1,'nhl','Second post')",[a])),/thirty seconds/);
 await assert.rejects(asMember(()=>db.query("insert into public.community_posts(user_id,sport,body) values($1,'nhl','Forged Dealer')",[dealer])),/Sign in as the author/);
});
await t.test('original emitter failures still roll back acceptance and every Zone side effect',async()=>{
 const id=await newPick(),before=await settings();
 await db.exec(`create function private.synthetic_emitter_failure() returns trigger language plpgsql as $$begin if new.message='Emitter fails' then raise exception 'Synthetic original emitter failure';end if;return new;end$$;
 create trigger synthetic_emitter_failure before insert on public.notifications for each row execute function private.synthetic_emitter_failure();`);
 await assert.rejects(alert(id,'Emitter fails'),/Synthetic original emitter failure/);
 assert.equal((await one('select count(*)::int n from private.live_pick_alerts where pick_id=$1',[id])).n,0);
 assert.equal((await one("select count(*)::int n from public.community_posts where id=md5('live-pick-zone:'||$1)::uuid",[id])).n,0);
 assert.deepEqual(await settings(),before);await db.exec('drop trigger synthetic_emitter_failure on public.notifications');
 assert.ok((await alert(id,'Emitter recovers')).n>0);
});
await t.test('Dealer identity outage cannot suppress original alerts and repairs without replay',async()=>{
 const id=await newPick(),before=await settings();
 await db.exec(`update auth.users set raw_app_meta_data='{}' where id='${dealer}'`);
 assert.ok((await alert(id,'Dealer identity recovery result')).n>0);
 const queued=await one('select zone_status,zone_last_error from private.live_pick_alerts where pick_id=$1',[id]);
 assert.equal(queued.zone_status,'pending');assert.match(queued.zone_last_error,/Verified Dealer publisher required/);assert.deepEqual(await settings(),before);
 const notifications=(await one('select count(*)::int n from public.notifications where content_id=$1',[id])).n;
 await db.exec(`update auth.users set raw_app_meta_data='{"publisher":"vq_dealer"}' where id='${dealer}'`);
 await due(id);assert.equal((await retry()).posted,1);
 assert.equal((await one('select count(*)::int n from public.notifications where content_id=$1',[id])).n,notifications);
});
await t.test('permanent post failure backs off to eight attempts, remains visible in health, and stops retrying',async()=>{
 const id=await newPick(),before=await settings();await alert(id,'guaranteed profit');
 for(let attempt=1;attempt<=8;attempt++){
  const r=await one('select *,extract(epoch from(zone_next_attempt_at-zone_attempted_at))/60 minutes from private.live_pick_alerts where pick_id=$1',[id]);
  assert.equal(r.zone_attempts,attempt);assert.ok(r.zone_last_error.length<=200);assert.match(r.zone_last_error,/harmful content/);
  if(attempt<8){assert.equal(r.zone_status,'pending');assert.equal(Number(r.minutes),Math.min(60,2**(attempt-1)));await due(id);assert.equal((await retry()).failed,1);}
  else{assert.equal(r.zone_status,'blocked');assert.equal(r.zone_next_attempt_at,null);}
 }
 assert.equal((await retry()).attempted,0);assert.equal((await health()).blocked,1);assert.deepEqual(await settings(),before);
 assert.equal((await one('select social_notification_health() h')).h.zone_results.blocked,1);
});
await t.test('bounded batch isolates collisions and unhealthy rows; scheduler wakes without candidates',async()=>{
 // Synthetic accepted ledger rows isolate batch mechanics from fresh-pick fan-out.
 const ids=[];for(let i=0;i<22;i++){const id=await newPick();ids.push(id);await db.query("insert into private.live_pick_alerts(pick_id,sport,message,zone_status,zone_next_attempt_at) values($1,'nhl',$2,'pending',now()-interval '1 minute')",[id,`Batch result ${i}`]);}
 const collision=ids[0],collisionId=(await one("select md5('live-pick-zone:'||$1)::uuid id",[collision])).id;
 await db.exec(`update public.community_posts set created_at=now()-interval '1 minute' where user_id='${a}'`);
 await db.query("insert into public.community_posts(id,user_id,sport,body) values($1,$2,'nhl','Unrelated existing post')",[collisionId,a]);
 const first=await retry();assert.equal(first.attempted,20);assert.equal(first.posted+first.failed,20);
 const second=await retry();assert.equal(second.attempted,2);
 assert.equal((await one('select body from public.community_posts where id=$1',[collisionId])).body,'Unrelated existing post');
 assert.equal((await one('select zone_status from private.live_pick_alerts where pick_id=$1',[collision])).zone_status,'pending');
 assert.equal((await one("select count(*)::int n from private.live_pick_alerts where pick_id=any($1::uuid[]) and zone_status='posted'",[ids])).n,21);
 const candidateDefinition=(await one("select pg_get_functiondef('public.live_pick_candidates()'::regprocedure) d")).d;
 await db.exec("create or replace function public.live_pick_candidates() returns jsonb language sql stable security definer set search_path='' as $$select '[]'::jsonb$$");
 await due(collision);await db.query('select private.invoke_live_pick_alerts()');
 assert.equal((await one('select count(*)::int n from private.synthetic_http_calls')).n,1);
 await db.exec("create or replace function public.live_pick_candidates() returns jsonb language plpgsql stable security definer set search_path='' as $$begin raise exception 'Synthetic candidate outage';end$$");
 await db.query('select private.invoke_live_pick_alerts()');assert.equal((await one('select count(*)::int n from private.synthetic_http_calls')).n,2,'due retry short-circuits candidate failure');
 await db.exec(candidateDefinition);
 assert.equal((await one('select zone_status,zone_attempts from private.live_pick_alerts where pick_id=$1',[historic])).zone_status,null,'historical row never queued');
 for(const role of ['anon','authenticated'])for(const fn of ['public.retry_live_pick_zone_posts()','public.live_pick_zone_health()'])assert.equal((await one("select has_function_privilege($1,$2,'execute') ok",[role,fn])).ok,false);
});
await t.test('Zone insert fan-out follows authors, broadcasts Dealer automation and deduplicates mentions',async()=>{
 await db.exec('delete from public.notifications;delete from private.notification_events');
 await follow(b);await unfollow(c);
 const post=async(author,body,automated=false)=>{
  await db.exec(`update public.community_posts set created_at=now()-interval '1 minute' where user_id='${author}';set request.jwt.claim.sub='${author}';set vq.automated_post='${automated?'on':'off'}'`);
  try{return (await one("insert into public.community_posts(user_id,sport,body) values($1,'nhl',$2) returning id",[author,body])).id;}
  finally{await db.exec(`set request.jwt.claim.sub='${a}';set vq.automated_post='off'`);}
 };
 let id=await post(b,'Ordinary followed-author post');
 assert.deepEqual((await q('select recipient_id,type from public.notifications where post_id=$1',[id])),[{recipient_id:a,type:'post'}]);
 id=await post(c,'Unfollowed admin');assert.equal((await q('select id from public.notifications where post_id=$1',[id])).length,0);
 id=await post(b,'Ordinary automation',true);assert.equal((await q('select id from public.notifications where post_id=$1',[id])).length,0);
 id=await post(dealer,'Verified automated Dealer publication',true);
 assert.deepEqual((await q('select recipient_id from public.notifications where post_id=$1 order by recipient_id',[id])).map(r=>r.recipient_id),[a,b,c]);
 id=await post(dealer,'Hi @Alice, synthetic Dealer publication',true);
 assert.deepEqual((await q('select type from public.notifications where post_id=$1 and recipient_id=$2',[id,a])).map(r=>r.type),['mention']);
 assert.equal((await q("select id from public.notifications where post_id=$1 and type='post'",[id])).length,2);
 await db.exec(`update auth.users set email_confirmed_at=null where id='${a}'`);
 assert.equal(await emit(dealer,'message'),null);
 id=await post(dealer,'Publication with unconfirmed recipient',true);
 assert.equal((await q('select id from public.notifications where post_id=$1 and recipient_id=$2',[id,a])).length,0);
 await db.exec(`update auth.users set email_confirmed_at=now() where id='${a}'`);
});
await t.test('invalid, unknown, future and superseded picks cannot create result posts or ledger rows',async()=>{
 const snapshot=async()=>one('select (select count(*)::int from public.community_posts) posts,(select count(*)::int from private.live_pick_alerts) alerts');
 const before=await snapshot();
 const unknown='00000000-0000-4000-8000-000000000077';
 await assert.rejects(alert(unknown,'Unknown cleared'),/Unknown pick/);
 const futureGame=(await one("insert into public.sports_games(sport,slug,start_time) values('nhl','future-game',now()+interval '1 hour') returning id")).id;
 const futurePick=(await one('insert into public.sports_selections(game_id) values($1) returning id',[futureGame])).id;
 await assert.rejects(alert(futurePick,'Future cleared'),/Unknown pick/);
 const nbaGame=(await one("insert into public.nba_games(slug,tipoff) values('started-nba',now()-interval '1 hour') returning id")).id;
 const prior=(await one('insert into public.nba_editorial_picks(game_id) values($1) returning id',[nbaGame])).id;
 await db.query('insert into public.nba_editorial_picks(game_id,supersedes_id) values($1,$2)',[nbaGame,prior]);
 await assert.rejects(db.query("select public.live_pick_alert('nba',$1,'Superseded cleared','/nba/games/started-nba')",[prior]),/Unknown pick/);
 const valid=await newPick();
 await assert.rejects(alert(valid,''),/Invalid live alert/);
 await assert.rejects(alert(valid,'   '),/Invalid live alert/);
 await assert.rejects(db.query("select public.live_pick_alert('nhl',$1,'Synthetic cleared','https://example.invalid/escape')",[valid]),/Invalid live alert/);
 await assert.rejects(db.query("select public.live_pick_alert('nhl',$1,'Synthetic cleared','/community')",[valid]),/Invalid live alert/);
 assert.deepEqual(await snapshot(),before,'rejected calls leave both ledger and Zone unchanged');
});
await t.test('public RPC works as service_role under authenticator session; authenticated cannot invoke it',async()=>{
 const denied=await newPick();await assert.rejects(asMember(()=>alert(denied,'Untrusted')),/permission denied/);
 assert.equal((await one('select count(*)::int n from private.live_pick_alerts where pick_id=$1',[denied])).n,0);
 // Install actual card trigger definitions at the RPC boundary, with the deployed username substitution.
 // The editorial-leg sentinel must never execute from a service-session result publication.
 await db.exec(`insert into private.zone_automation values('nba_threes','${dealer}');
 create function private.zone_editorial_leg(uuid,uuid,text,text,text,timestamptz) returns text language plpgsql as $$begin raise exception 'Unexpected editorial-leg lookup from service result';end$$;
 grant select on public.community_posts to service_role;`);
 for(const fn of ['private.attach_zone_automated_card','private.community_post_card_guard'])
  await db.exec(functionFrom('supabase/migrations/20261031190200_zone_automated_cards.sql',fn).replaceAll("p.username='MikeQ'","p.username='TheDealer'"));
 await db.exec(`create trigger a_attach_zone_automated_card before insert on public.community_posts for each row execute function private.attach_zone_automated_card();
 create trigger community_post_card_guard before insert on public.community_posts for each row execute function private.community_post_card_guard();`);
 await db.exec('create role authenticator noinherit;grant service_role,authenticated to authenticator');
 const id=await newPick(),harmful=await newPick();
 // Last case: PGlite RESET SESSION AUTHORIZATION does not restore its original bootstrap identity.
 await db.exec('set session authorization authenticator;set role service_role');
 assert.ok((await alert(id,'Service-session cleared')).n>=0);
 assert.equal((await one("select card from public.community_posts where id=md5('live-pick-zone:'||$1)::uuid",[id])).card,null,'service result remains ordinary talk, not a spoofed editorial card');
 assert.deepEqual(await one('select session_user,current_user'),{session_user:'authenticator',current_user:'service_role'});
 const serviceSettings=await settings(),serviceRoles=await one('select session_user,current_user');
 const pendingBefore=(await health()).pending;
 assert.ok((await alert(harmful,'guaranteed profit')).n>0,'caught publication failure preserves service-origin alert');
 assert.deepEqual(await settings(),serviceSettings);assert.deepEqual(await one('select session_user,current_user'),serviceRoles);
 assert.equal((await health()).pending,pendingBefore+1,'service health exposes pending failed publication');

});

});

await test('migration fails closed without deployed Dealer identity prerequisite',async(t)=>{
 const isolated=new PGlite();t.after(()=>isolated.close());
 await isolated.exec('create schema private');
 await assert.rejects(isolated.exec(sql('supabase/migrations/20261109032951_dealer_zone_follow_notifications.sql')),/Dealer identity migration required/);
 await isolated.exec('rollback');
 const rows=(await isolated.query("select to_regprocedure('private.notification_actor_followed(uuid,uuid,text)') fn")).rows;
 assert.equal(rows[0].fn,null,'failed precondition creates no follow helper');
});
