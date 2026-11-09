// Executes both byte-preserved recovered migrations over synthetic prerequisites only.
// Seams: minimal tables; signup enqueue trigger is synthetic; age_eligible is the real
// source definition. Three surrounding profile functions are minimal definer fixtures
// with the exact email/ban anchors plus explicit viewer/block/restriction predicates.
// This verifies the visibility rewrite, not the complete production profile RPC contract.
import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
const root=new URL('../../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8');
const identityPath='supabase/migrations/20261106221542_dealer_publisher_identity.sql';
const visibilityPath='supabase/migrations/20261106221738_dealer_profile_visibility.sql';
const identity=read(identityPath),visibility=read(visibilityPath);
const functionFrom=(file,name)=>{const s=read(file),start=s.indexOf('function '+name+'('),begin=s.lastIndexOf('create ',start),end=s.indexOf('$$;',start)+3;assert.ok(start>=0&&end>start);return s.slice(begin,end);};
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const post=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const fixture=async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
 create table auth.users(id uuid primary key,aud text,role text,email text,phone text,encrypted_password text,email_confirmed_at timestamptz,raw_app_meta_data jsonb,raw_user_meta_data jsonb,banned_until timestamptz,created_at timestamptz,updated_at timestamptz);
 create table auth.identities(id uuid,user_id uuid);create table auth.sessions(id uuid,user_id uuid);
 create table private.admin_users(user_id uuid);create table public.ruby_contributors(user_id uuid);
 create table public.member_follows(user_id uuid,target_user_id uuid);
 create table private.push_deliveries(event_key text);
 create function private.synthetic_signup() returns trigger language plpgsql as $$begin insert into private.push_deliveries values('signup:'||new.id::text);return new;end$$;
 create trigger synthetic_signup after insert on auth.users for each row execute function private.synthetic_signup();
 create table private.age_policy(singleton boolean,enforced boolean,version int);create table private.age_checks(user_id uuid,state text,policy_version int);
 insert into private.age_policy values(true,false,1);
 create table private.zone_automation(name text primary key,user_id uuid references auth.users);
 create table public.community_profiles(user_id uuid primary key references auth.users,username text,avatar text,visible boolean);
 create table public.community_posts(id uuid primary key,user_id uuid references auth.users,author_name text,photo_path text,card text,body text,sport text,title text,legs jsonb,created_at timestamptz default now());
 insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.invalid',now()),('${other}','other@example.invalid',now());
 insert into public.community_profiles values('${owner}','MikeQ','synthetic',true),('${other}','Other','synthetic',true);
 insert into private.zone_automation values('nba_threes','${owner}'),('sports_editorial','${owner}');
 insert into private.admin_users values('${owner}');insert into public.ruby_contributors values('${owner}');insert into public.member_follows values('${other}','${owner}');
 insert into public.community_posts(id,user_id,author_name,card,photo_path,body) values
 ('${post(11)}','${owner}','Original snapshot','vq-publication:v1',null,'Eligible editorial'),
 ('${post(12)}','${owner}','Original threes snapshot','nba-threes:2026-11-06',null,'Eligible threes'),
 ('${post(13)}','${owner}','MikeQ','vq-publication:v1','owner/photo.jpg','Photo retained'),
 ('${post(14)}','${owner}','MikeQ',null,null,'Ordinary retained'),
 ('${post(15)}','${other}','Other','vq-publication:v1',null,'Other author retained'),
 ('${post(16)}','${owner}','MikeQ','nba-threes:invalid',null,'Invalid marker retained');
 create table private.viewer_state(allowed boolean,blocked boolean,restricted boolean);insert into private.viewer_state values(true,false,false);
 create function public.community_avatars(p_ids uuid[]) returns setof uuid language sql stable security definer set search_path='' as $$select u.id from auth.users u join public.community_profiles cp on cp.user_id=u.id where u.id=any(p_ids) and cp.visible and (select allowed and not blocked and not restricted from private.viewer_state) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())$$;
 create function private.community_activity() returns setof uuid language sql stable security definer set search_path='' as $$select u.id from auth.users u join public.community_profiles cp on cp.user_id=u.id where cp.visible and (select allowed and not blocked and not restricted from private.viewer_state) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())$$;
 create function private.before_age_community_member(p_username text) returns uuid language sql stable security definer set search_path='' as $$select u.id from auth.users u join public.community_profiles cp on cp.user_id=u.id where cp.username=p_username and cp.visible and (select allowed and not blocked and not restricted from private.viewer_state) and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())$$;`);
 await db.exec(functionFrom('supabase/migrations/20261014103812_verified_age_gate.sql','private.age_eligible'));
 for(const fn of ['private.attach_zone_automated_card','private.community_post_card_guard']) await db.exec(functionFrom('supabase/migrations/20261031190200_zone_automated_cards.sql',fn));
 return db;
};
const rows=async(db,s,args=[]) => (await db.query(s,args)).rows;
const one=async(db,s,args=[]) => (await rows(db,s,args))[0];
const apply=async(db)=>{await db.exec('begin');try{await db.exec(identity);await db.exec(visibility);await db.exec('commit');}catch(e){await db.exec('rollback');throw e;}};
await test('recovered statements retain exact source hashes',()=>{
 assert.equal(createHash('sha256').update(identity).digest('hex'),'a5bd0fcfbd4532efbb0eb1295a29640fec85ccb77cfc91c7f99a07b622382597');
 assert.equal(createHash('sha256').update(visibility).digest('hex'),'f5269729637d54fbc4840842dfa8a47567b4cbcffb921da733f1203db7f821d0');
});
await test('complete recovery keeps least privilege and audited, marker-only attribution',async(t)=>{
 const db=await fixture();t.after(()=>db.close());
 const before=await rows(db,'select id,body,created_at::text from public.community_posts order by id');
 await apply(db);
 const dealer=(await one(db,"select user_id from private.zone_automation where name='vq_dealer'")).user_id;
 assert.notEqual(dealer,owner);
 const account=await one(db,'select email,phone,encrypted_password,banned_until::text,raw_app_meta_data from auth.users where id=$1',[dealer]);
 assert.deepEqual(account,{email:null,phone:null,encrypted_password:null,banned_until:'infinity',raw_app_meta_data:{publisher:'vq_dealer'}});
 for(const table of ['auth.identities','auth.sessions','private.admin_users','public.ruby_contributors']) assert.equal((await one(db,`select count(*)::int n from ${table} where user_id=$1`,[dealer])).n,0,table);
 assert.equal((await one(db,'select count(*)::int n from public.member_follows where user_id=$1 or target_user_id=$1',[dealer])).n,0);
 assert.deepEqual(await rows(db,'select * from public.member_follows'),[{user_id:other,target_user_id:owner}]);
 assert.equal((await one(db,"select count(*)::int n from private.push_deliveries where event_key='signup:'||$1",[dealer])).n,0);
 assert.equal((await one(db,'select count(*)::int n from private.age_checks where user_id=$1',[dealer])).n,0,'no invented age attestation');
 assert.deepEqual(await rows(db,'select id,body,created_at::text from public.community_posts order by id'),before);
 assert.deepEqual(await rows(db,'select post_id,original_user_id,original_author_name,dealer_user_id from private.dealer_attribution_history order by post_id'),[
  {post_id:post(11),original_user_id:owner,original_author_name:'Original snapshot',dealer_user_id:dealer},
  {post_id:post(12),original_user_id:owner,original_author_name:'Original threes snapshot',dealer_user_id:dealer}]);
 for(const n of [11,12]) assert.deepEqual(await one(db,'select user_id,author_name from public.community_posts where id=$1',[post(n)]),{user_id:dealer,author_name:'TheDealer'});
 for(const n of [13,14,16]) assert.equal((await one(db,'select user_id from public.community_posts where id=$1',[post(n)])).user_id,owner);
 assert.equal((await one(db,'select user_id from public.community_posts where id=$1',[post(15)])).user_id,other);
 assert.equal((await one(db,'select count(distinct user_id)::int n from private.zone_automation')).n,1);
 for(const role of ['anon','authenticated','service_role']) {
  assert.equal((await one(db,"select has_function_privilege($1,'private.is_dealer_publisher(uuid)','execute') ok",[role])).ok,false);
  assert.equal((await one(db,"select has_table_privilege($1,'private.dealer_attribution_history','select') ok",[role])).ok,false);
 }
 assert.equal((await one(db,"select relrowsecurity ok from pg_class where oid='private.dealer_attribution_history'::regclass")).ok,true);
 const visible=async()=>[
  (await rows(db,'select public.community_avatars($1::uuid[]) id',[[dealer]])).some(x=>x.id===dealer),
  (await rows(db,'select private.community_activity() id')).some(x=>x.id===dealer),
  (await one(db,"select private.before_age_community_member('TheDealer') id")).id===dealer];
 assert.deepEqual(await visible(),[true,true,true]);
 for(const flag of ['allowed','blocked','restricted']){
  await db.exec(`update private.viewer_state set ${flag}=${flag==='allowed'?'false':'true'}`);
  assert.deepEqual(await visible(),[false,false,false],`viewer ${flag} boundary retained`);
  await db.exec(`update private.viewer_state set ${flag}=${flag==='allowed'?'true':'false'}`);
 }
 for(const field of ["raw_app_meta_data='{}'","email='unexpected@example.invalid'","phone='synthetic'","encrypted_password='synthetic'","banned_until=null"]){
  await db.exec('begin');await db.exec(`update auth.users set ${field} where id='${dealer}'`);
  assert.equal((await one(db,'select private.is_dealer_publisher($1) ok',[dealer])).ok,false,field);assert.deepEqual(await visible(),[false,false,false]);await db.exec('rollback');
 }
 await db.exec(`update auth.users set banned_until='infinity' where id='${other}'`);
 assert.equal((await one(db,"select private.before_age_community_member('Other') id")).id,null,'ordinary banned profile not exempt');
});
for(const mode of ['age-enforced','username-collision','publisher-mismatch']) await test(`recovery fails atomically for ${mode}`,async(t)=>{
 const db=await fixture();t.after(()=>db.close());
 if(mode==='age-enforced') await db.exec('update private.age_policy set enforced=true');
 if(mode==='username-collision') await db.exec(`update public.community_profiles set username='tHeDeAlEr' where user_id='${other}'`);
 if(mode==='publisher-mismatch') await db.exec(`update private.zone_automation set user_id='${other}' where name='sports_editorial'`);
 await assert.rejects(apply(db),mode==='age-enforced'?/no age attestation is fabricated/:mode==='username-collision'?/username already exists/:/Publisher mappings differ/);
 assert.equal((await one(db,'select count(*)::int n from auth.users')).n,2);
 assert.equal((await one(db,"select count(*)::int n from private.zone_automation where name='vq_dealer'")).n,0);
 assert.equal((await one(db,'select user_id from public.community_posts where id=$1',[post(11)])).user_id,owner);
 assert.equal((await one(db,"select to_regclass('private.dealer_attribution_history') relation")).relation,null);
});
