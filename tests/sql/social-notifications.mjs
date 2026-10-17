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
await db.exec(`insert into public.community_posts values('${p}','${a}','nfl','Hello @Carol');insert into public.community_reactions(post_id,user_id) values('${p}','${a}'),('${p}','${b}'),('${p}','${c}');`);
assert.equal((await db.query(`select count(*)::int n from public.notifications where type='like'`)).rows[0].n,1);
let like=(await db.query(`select * from public.notifications where type='like'`)).rows[0];assert.equal(like.event_count,2);assert.equal(like.actor_name,'Carol');
await db.exec(`delete from public.community_reactions where user_id='${b}';insert into public.community_reactions(post_id,user_id) values('${p}','${b}');`);
assert.equal((await db.query(`select event_count from public.notifications where type='like'`)).rows[0].event_count,2);
await db.exec(`insert into public.community_post_comments values('${comment}','${b}','${p}','Nice @Carol',now(),null);insert into public.community_post_comments values(gen_random_uuid(),'${c}','${p}','Thanks @Bob',now(),'${comment}');`);
assert.equal((await db.query(`select count(*)::int n from public.notifications where type='reply' and recipient_id='${b}'`)).rows[0].n,1);
assert.equal((await db.query(`select sum(event_count)::int n from public.notifications where type='mention' and recipient_id='${c}'`)).rows[0].n,2);
await db.exec(`insert into public.member_follows(user_id,target_user_id) values('${b}','${a}');insert into public.community_comment_reactions values('${comment}','${c}');insert into public.community_shares values('${p}','${b}');`);
assert.equal((await db.query(`select count(*)::int n from public.notifications where type in ('follow','share','comment_reaction')`)).rows[0].n,3);
// Recipient isolation, no client event spoofing, owner-only read state.
await db.exec(`set role authenticated;set app.uid='${a}';`);
let inbox=(await db.query('select public.notification_inbox() inbox')).rows[0].inbox;assert.ok(inbox.items.length);assert.ok(inbox.items.every(n=>n.recipient_id===a));
await assert.rejects(db.query(`select public.publish_system_notification('${b}','security','fake','fake')`));
await assert.rejects(db.query(`insert into public.notifications(recipient_id)values('${b}')`));
await db.query(`select public.notification_action('read_all')`);
assert.equal((await db.query('select public.notification_counts() counts')).rows[0].counts.unread,0);
await db.exec(`reset role;insert into public.community_post_comments values(gen_random_uuid(),'${b}','${p}','Another comment',now(),null);`);
assert.ok((await db.query(`select count(*)::int n from public.notifications where recipient_id='${a}' and read_at is null`)).rows[0].n>0);
// Preferences suppress creation, blocks remove grouped identity snapshots.
await db.exec(`update public.notification_preferences set disabled_types=array['share'] where user_id='${a}';insert into public.community_shares values('${p}','${c}');insert into public.member_blocks values('${a}','${b}');`);
assert.equal((await db.query(`select count(*)::int n from public.notifications n join private.notification_events e on e.notification_id=n.id where n.recipient_id='${a}' and e.actor_id='${b}'`)).rows[0].n,0);
// Critical system event, durable push job, lease and stale acknowledgment protection.
await db.exec(`update public.notification_preferences set push_enabled=true,email_enabled=true where user_id='${c}';insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)values('${c}','https://fcm.googleapis.com/example','key','auth');select public.publish_system_notification('${c}','security','unique-security','Secure your account.');`);
let jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;assert.equal(jobs.length,1);assert.equal(jobs[0].channel,'email');
await db.query(`select public.finish_social_notification_delivery($1,gen_random_uuid(),'sent')`,[jobs[0].id]);assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[jobs[0].id])).rows[0].state,'leased');
await db.query(`select public.finish_social_notification_delivery($1,$2,'sent')`,[jobs[0].id,jobs[0].lease]);
await db.exec(`update private.notification_deliveries set due_at=now()-interval '1 second' where state='pending';`);
jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;assert.equal(jobs.length,1);assert.equal(jobs[0].channel,'push');assert.equal((await db.query('select public.social_notification_delivery_allowed($1,$2) ok',[jobs[0].id,jobs[0].lease])).rows[0].ok,true);
await db.exec(`update public.notification_preferences set push_enabled=false where user_id='${c}'`);
assert.equal((await db.query('select public.social_notification_delivery_allowed($1,$2) ok',[jobs[0].id,jobs[0].lease])).rows[0].ok,false);
await db.exec(`update auth.users set encrypted_password='new' where id='${c}'`);
assert.equal((await db.query(`select count(*)::int n from public.notifications where recipient_id='${c}' and type='password_change'`)).rows[0].n,1);

// Read receipts cannot consume a newer grouped interaction than the displayed snapshot.
let race=(await db.query(`select * from public.notifications where recipient_id='${c}' order by updated_at desc limit 1`)).rows[0];
if(race){await db.query(`update public.notifications set updated_at=now()+interval '1 second',read_at=null where id=$1`,[race.id]);await db.exec(`set role authenticated;set app.uid='${c}'`);await db.query(`select public.notification_action('read',$1,$2)`,[race.id,race.updated_at]);await db.exec('reset role');assert.equal((await db.query('select read_at from public.notifications where id=$1',[race.id])).rows[0].read_at,null);}
// Online deferral and quiet hours apply to social pushes; consent remains checked at dispatch.
const p2='00000000-0000-4000-8000-000000000008';
await db.exec(`update public.notification_preferences set push_enabled=true where user_id='${b}';insert into public.push_subscriptions(user_id,endpoint,p256dh,auth)values('${b}','https://fcm.googleapis.com/bob','key','auth');insert into public.community_posts values('${p2}','${b}','nfl','Another post');insert into public.community_reactions(post_id,user_id) values('${p2}','${c}');set role authenticated;set app.uid='${b}';select public.notification_pulse('${p2}',true);reset role;update private.notification_deliveries set due_at=now()-interval '1 second' where notification_id in(select id from public.notifications where recipient_id='${b}');`);
jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;assert.equal(jobs.filter(j=>j.recipient_id===b).length,0);
await db.exec(`update private.notification_presence set visible=false where user_id='${b}';update public.notification_preferences set quiet_enabled=true,timezone='UTC',quiet_start=extract(hour from now() at time zone 'UTC')::int,quiet_end=(extract(hour from now() at time zone 'UTC')::int+1)%24 where user_id='${b}';update private.notification_deliveries set due_at=now()-interval '1 second' where state='pending' and notification_id in(select id from public.notifications where recipient_id='${b}');`);
jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;assert.equal(jobs.filter(j=>j.recipient_id===b).length,0);
await db.exec(`update public.notification_preferences set quiet_enabled=false where user_id='${b}';update private.notification_deliveries set due_at=now()-interval '1 second' where state='pending' and notification_id in(select id from public.notifications where recipient_id='${b}');`);
jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;const bobJob=jobs.find(j=>j.recipient_id===b);assert.ok(bobJob);
await db.query(`update private.notification_deliveries set lease_until=now()-interval '1 second',due_at=now()-interval '1 second' where id=$1`,[bobJob.id]);
jobs=(await db.query('select public.claim_social_notification_deliveries() jobs')).rows[0].jobs;const reclaimed=jobs.find(j=>j.id===bobJob.id);assert.ok(reclaimed);assert.notEqual(reclaimed.lease,bobJob.lease);
await db.query(`select public.finish_social_notification_delivery($1,$2,'sent')`,[bobJob.id,bobJob.lease]);assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[bobJob.id])).rows[0].state,'leased');
await db.query(`update private.notification_deliveries set attempts=5,lease_until=now()-interval '1 second',due_at=now()-interval '1 second' where id=$1`,[bobJob.id]);await db.query('select public.claim_social_notification_deliveries()');assert.equal((await db.query('select state from private.notification_deliveries where id=$1',[bobJob.id])).rows[0].state,'dead');
let rateRejected=false;
for(let i=0;i<65;i++){
 try{await db.exec(`delete from public.community_reactions where post_id='${p2}' and user_id='${c}';insert into public.community_reactions(post_id,user_id)values('${p2}','${c}');`);}catch(error){assert.match(error.message,/Please wait/);rateRejected=true;break;}
}
assert.equal(rateRejected,true);
console.log('PASS transactional social events, grouping/dedup, mentions/replies, isolation, preferences, blocking, password events, delivery leases and consent rechecks.');await db.close();
