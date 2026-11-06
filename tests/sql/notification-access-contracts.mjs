import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
const root=new URL('../../',import.meta.url);
const sql=(path)=>fs.readFileSync(new URL(path,root),'utf8');
import assert from 'node:assert/strict';
import test from 'node:test';
await test('composed notification recipient and channel contracts',async(t)=>{
const db=new PGlite();t.after(()=>db.close());
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
const zone=sql('supabase/migrations/20261028230000_zone_post_notifications.sql');await db.exec(zone.slice(0,zone.indexOf('create function private.zone_post_notify')));
const live=sql('supabase/migrations/20261101100000_live_pick_alerts.sql');await db.exec(live.slice(0,live.indexOf('-- One row per decided pick')));

await db.exec(`insert into private.age_checks select id,'verified',1 from auth.users;
insert into auth.sessions values('00000000-0000-4000-8000-000000000011','${a}',now()+interval '1 day');
insert into private.memberships values('${a}',null,now()-interval '1 day',now()+interval '1 day');
insert into private.admin_users values('${c}');set app.uid='${a}';set app.session='00000000-0000-4000-8000-000000000011';`);
const attr=()=>db.query("select proacl,prosecdef,provolatile,proconfig from pg_proc where oid='public.social_notification_delivery_allowed(uuid,uuid)'::regprocedure");
const before=(await attr()).rows;
let prepared=sql('supabase/migrations/20261103113707_notification_access_contracts.sql');
if(process.env.NOTIFICATION_NEGATIVE==='no-backoff') prepared=prepared.replace(/ update private.notification_deliveries d set due_at=now\(\)\+interval '5 minutes'[\s\S]*?is distinct from true;/,'');
await db.exec(prepared);
const emit=async(type,key,user=a)=>(await db.query(`select private.emit_notification($1,null,$2,$3,null,null,null,'Synthetic fixture',$4) id`,[user,type,key,type==='pick'?'/nba/games/synthetic':'/membership'])).rows[0].id;
const inbox=async(user=a)=>{await db.exec(`set app.uid='${user}';set role authenticated;`);try{return (await db.query('select notification_inbox() data')).rows[0].data.items;}finally{await db.exec('reset role');}};
const valid=async()=>db.exec(`update private.memberships set expires_at=now()+interval '1 day';delete from private.age_checks where user_id='${a}';insert into private.age_checks values('${a}','verified',1);`);
await t.test('actual age and entitlement wrappers compose; recipients and metadata stay scoped',async()=>{
 assert.equal((await db.query('select private.has_membership() m')).rows[0].m,true);
 assert.deepEqual((await attr()).rows,before);
 await db.exec('set role authenticated');await assert.rejects(db.query(`select private.pick_notification_recipient_allowed('${b}')`));await db.exec('reset role');
});
await t.test('protected inbox follows current eligibility and owner isolation while system notices remain',async()=>{
 const pick=await emit('pick','inbox-pick'),security=await emit('security','inbox-security');assert.ok(pick&&security);
 assert.ok((await inbox()).some(x=>x.id===pick));
 assert.equal((await inbox(b)).some(x=>x.id===pick),false);
 await db.exec(`update private.memberships set expires_at=now()-interval '1 second';`);
 let rows=await inbox();assert.equal(rows.some(x=>x.id===pick),false);assert.ok(rows.some(x=>x.id===security));
 await valid();await db.exec(`delete from private.age_checks where user_id='${a}';`);
 rows=await inbox();assert.equal(rows.some(x=>x.id===pick),false);assert.ok(rows.some(x=>x.id===security));
 await valid();
});
await t.test('queue claim and final dispatch recheck current protected-content eligibility',async()=>{
 // Keep this case independent of the prior inbox group's intentionally deduplicated delivery.
 await db.exec("delete from public.notifications where type='pick'");
 await db.exec(`update public.notification_preferences set push_enabled=true where user_id='${a}';insert into public.push_subscriptions(user_id,endpoint,p256dh,auth) values('${a}','https://example.invalid/push','synthetic','synthetic');`);
 const id=await emit('pick','delivery-pick');
 await db.exec(`update private.notification_deliveries set due_at=now()-interval '1 second';update private.memberships set expires_at=now()-interval '1 second';`);
 let jobs=(await db.query('select claim_social_notification_deliveries() jobs')).rows[0].jobs;
 assert.equal(jobs.some(x=>x.notification_id===id),false);
 const due=async()=>(await db.query(`select exists(select 1 from private.notification_deliveries where (state='pending' or(state='leased' and lease_until<now())) and due_at<=now() and (attempts<5 or state='leased')) due`)).rows[0].due;
 assert.equal(await due(),false,'ineligible queue must stop immediate dispatcher wakeups');
 await db.query('select claim_social_notification_deliveries()');assert.equal(await due(),false);
 await valid();
 assert.equal((await db.query('select claim_social_notification_deliveries() jobs')).rows[0].jobs.some(x=>x.notification_id===id),false,'recovery respects retry time');
 await db.exec(`update private.notification_deliveries set due_at=now()-interval '1 second' where notification_id='${id}'`);
 jobs=(await db.query('select claim_social_notification_deliveries() jobs')).rows[0].jobs;const job=jobs.find(x=>x.notification_id===id);assert.ok(job);
 assert.equal((await db.query('select social_notification_delivery_allowed($1,$2) ok',[job.id,job.lease])).rows[0].ok,true);
 await db.exec(`update public.notification_preferences set push_enabled=false where user_id='${a}';`);
 assert.equal((await db.query('select social_notification_delivery_allowed($1,$2) ok',[job.id,job.lease])).rows[0].ok,false);
 await db.exec(`update public.notification_preferences set push_enabled=true where user_id='${a}';`);
 await db.exec(`delete from private.age_checks where user_id='${a}';`);
 assert.equal((await db.query('select social_notification_delivery_allowed($1,$2) ok',[job.id,job.lease])).rows[0].ok,false);await valid();
 // Reclaimable ineligible leases defer without consuming attempts; active leases retain ownership.
 await db.exec(`update private.notification_deliveries set due_at=now()-interval '1 second',lease_until=now()-interval '1 second' where id='${job.id}';update private.memberships set expires_at=now()-interval '1 second';`);
 const attempts=(await db.query('select attempts from private.notification_deliveries where id=$1',[job.id])).rows[0].attempts;
 const mixedNotice=await emit('security','mixed-eligible');
 await db.query("update private.notification_deliveries set due_at=now()-interval '1 second' where notification_id=$1",[mixedNotice]);
 const mixed=(await db.query('select claim_social_notification_deliveries() jobs')).rows[0].jobs;
 assert.ok(mixed.some(x=>x.notification_id===mixedNotice));assert.equal(mixed.some(x=>x.notification_id===id),false);
 const deferred=(await db.query('select attempts,due_at>now() deferred from private.notification_deliveries where id=$1',[job.id])).rows[0];
 assert.equal(deferred.attempts,attempts);assert.equal(deferred.deferred,true);
 await db.exec(`update public.notifications set created_at=now()-interval '8 days' where id='${id}';update private.notification_deliveries set due_at=now()-interval '1 second' where id='${job.id}';`);
 await db.query('select claim_social_notification_deliveries()');
 assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[job.id])).rows[0].state,'suppressed');
 await valid();
});
await t.test('preexisting security/account mutes cannot erase inbox notices; external consent stays intact',async()=>{
 // Additional review-only regressions against the existing #200 dependency.
 await db.exec(`update public.notification_preferences set disabled_types=array[]::text[],push_enabled=false,email_enabled=true where user_id='${a}';`);
 const emailNotice=await emit('security','review-email-consent');assert.ok(emailNotice);
 await db.exec(`update private.notification_deliveries set due_at=now()-interval '1 second' where notification_id='${emailNotice}';`);
 const emailJobs=(await db.query('select claim_social_notification_deliveries() jobs')).rows[0].jobs;
 const emailJob=emailJobs.find(x=>x.notification_id===emailNotice&&x.channel==='email');assert.ok(emailJob);
 const emailAllowed=async()=>(await db.query('select social_notification_delivery_allowed($1,$2) ok',[emailJob.id,emailJob.lease])).rows[0].ok;
 assert.equal(await emailAllowed(),true);
 await db.exec(`update public.notification_preferences set email_enabled=false where user_id='${a}';`);assert.equal(await emailAllowed(),false);
 await db.exec(`update public.notification_preferences set email_enabled=true,disabled_types=array['security'] where user_id='${a}';`);assert.equal(await emailAllowed(),false);
 await db.exec(`update public.notification_preferences set disabled_types=array[]::text[] where user_id='${a}';`);
 await db.exec(`update private.notification_deliveries set lease_until=now()-interval '1 second' where id='${emailJob.id}';`);assert.equal(await emailAllowed(),false);
 await db.exec(`update public.notification_preferences set disabled_types=array['security','password_change','account'],push_enabled=false,email_enabled=false where user_id='${a}';`);
 for(const type of ['security','password_change','account']) {const id=await emit(type,'critical-'+type);assert.ok(id);assert.ok((await inbox()).some(x=>x.id===id));assert.equal((await db.query('select count(*)::int n from private.notification_deliveries where notification_id=$1',[id])).rows[0].n,0);}
});
await t.test('creation retains existing audience and per-type opt-outs',async()=>{
 assert.equal(await emit('pick','no-membership',b),null);
 assert.ok(await emit('pick','admin-member',c));
 await db.exec(`insert into private.billing_subscriptions values('${b}',false,now()+interval '1 day');`);
 assert.ok(await emit('pick','paid-billing',b));
 await db.exec(`update private.billing_subscriptions set blocked=true where user_id='${b}';`);
 assert.equal(await emit('pick','blocked-billing',b),null);
 await db.exec(`update public.notification_preferences set disabled_types=array['pick'] where user_id='${a}';`);
 assert.equal(await emit('pick','muted-pick'),null);
});
});
