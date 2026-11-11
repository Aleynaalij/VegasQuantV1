import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite(),
  owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002";
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create table private.zone_automation(name text primary key,user_id uuid);
insert into private.zone_automation values('nba_threes','${owner}'),('sports_editorial','${owner}');
create table public.community_profiles(user_id uuid,username text);insert into public.community_profiles values('${owner}','MikeQ');
create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,sport text,title text,body text,created_at timestamptz default now(),legs jsonb default '[]',card text constraint community_posts_card_check check(card is null or card like 'nba-threes:%'));
create table public.nba_editorial_picks(publication_key text,published_at timestamptz,rationale text,risk text,unknowns text);
create table public.sports_games(id uuid,sport text);create table public.sports_selections(author_id uuid,title text,published_at timestamptz,why text,risk text,game_id uuid);
insert into public.nba_editorial_picks values('fixture-nba','2026-10-31T15:00:00Z','Original analysis.','uncertainty.','Unknowns: missing reports.');
insert into public.community_posts(id,user_id,sport,title,body,created_at) values(md5('nba-editorial-zone:fixture-nba')::uuid,'${owner}','nba','Stored NBA selection',E'Skater Over 6.5 rebounds (+124)\n\nOriginal analysis.\n\nRisk: uncertainty.\n\nUnknowns: missing reports.', '2026-10-31T15:00:00Z');
insert into public.sports_games values('${other}','nhl');
insert into public.sports_selections values('${owner}','Stored NHL selection','2026-10-31T15:01:00Z','Original NHL analysis.','Original NHL risk.','${other}');
insert into public.community_posts(user_id,sport,title,body,created_at) values('${owner}','nhl','Stored NHL selection',E'Penguins moneyline (+100)\n\nOriginal NHL analysis.\n\nRisk: Original NHL risk.\n\nVegas Quant editorial read, not a guaranteed result. Prices move; check the current line.', '2026-10-31T15:01:00Z');
insert into public.sports_selections values('${owner}','Manual NHL selection','2026-10-31T15:02:00Z','Manual NHL analysis.','Manual NHL risk.','${other}');
insert into public.community_posts(user_id,sport,title,body,created_at) values('${owner}','nhl','Manual NHL selection',E'Manual NHL analysis.\n\nRisk: Manual NHL risk.\n\nQualitative editorial. FanDuel quote observed 2026-10-31\nhttps://example.com', '2026-10-31T15:02:00Z');
insert into public.community_posts(user_id,sport,title,body) values('${owner}','nfl','Community post','Cash it'),('${other}','nba','Member','My own notes');
insert into public.community_posts(user_id,sport,title,body,card) values('${owner}','nba','3-point volume','Research only','nba-threes:2026-10-31');
grant select,insert on public.community_posts to authenticated,service_role;
create function private.community_post_card_guard()returns trigger language plpgsql as $$begin return new;end $$;
create trigger community_post_card_guard before insert on public.community_posts for each row execute function private.community_post_card_guard();`);

await db.exec(readFileSync('supabase/migrations/20261031190200_zone_automated_cards.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261031191226_zone_card_editorial_provenance.sql','utf8'));
await db.exec(`create schema auth;
create table auth.users(id uuid primary key,aud text,role text,raw_app_meta_data jsonb,raw_user_meta_data jsonb,banned_until timestamptz,created_at timestamptz,updated_at timestamptz);
insert into auth.users(id) values('${owner}'),('${other}');
alter table public.community_posts add column author_name text default 'MikeQ';
alter table public.community_posts add column photo_path text;
alter table public.community_profiles add column avatar text;
alter table public.community_profiles add column visible boolean;
create table private.push_deliveries(event_key text);
create function private.age_eligible(uuid)returns boolean language sql as $$select true$$;
`);
const unchanged=(await db.query('select id,title,body,legs,created_at,card from community_posts order by id')).rows;
const personal=(await db.query("select * from community_posts where card is null order by id")).rows;
await db.exec(readFileSync('supabase/migrations/20261106221542_dealer_publisher_identity.sql','utf8'));
const dealer=(await db.query("select user_id from private.zone_automation where name='vq_dealer'")).rows[0].user_id;
assert.notEqual(dealer,owner);
assert.deepEqual((await db.query('select id,title,body,legs,created_at,card from community_posts order by id')).rows,unchanged);
assert.deepEqual((await db.query('select * from community_posts where card is null order by id')).rows,personal);
assert.equal((await db.query("select count(*)::int n from community_posts where card is not null and user_id=$1 and author_name='TheDealer'",[dealer])).rows[0].n,3);
assert.equal((await db.query('select count(*)::int n from private.dealer_attribution_history where original_user_id=$1',[owner])).rows[0].n,3);
const profile=(await db.query('select * from community_profiles where user_id=$1',[dealer])).rows[0];
assert.equal(profile.username,'TheDealer');assert.equal(profile.visible,true);assert.match(profile.avatar,/^data:image\/jpeg;base64,/);
assert.equal((await db.query("select banned_until::text b from auth.users where id=$1",[dealer])).rows[0].b,'infinity');
await db.exec(`insert into community_posts(user_id,sport,title,body) values('${dealer}','nfl','Future VQ card','Stored research');`);
assert.equal((await db.query("select card from community_posts where title='Future VQ card'")).rows[0].card,'vq-publication:v1');
await db.exec(`insert into community_posts(user_id,sport,title,body) values('${owner}','nfl','Future personal post','My thoughts');`);
assert.equal((await db.query("select card from community_posts where title='Future personal post'")).rows[0].card,null);
await assert.rejects(db.exec(`insert into community_posts(user_id,sport,title,body,card)values('${owner}','nfl','Old identity spoof','Notes','vq-publication:v1')`),/identity mismatch/);
await db.exec('set role authenticated');
await assert.rejects(db.exec(`insert into community_posts(user_id,sport,title,body,card)values('${dealer}','nfl','Member spoof','Notes','vq-publication:v1')`),/Vegas Quant only/);
await db.exec('reset role');
assert.equal((await db.query("select has_table_privilege('authenticated','private.dealer_attribution_history','select') allowed")).rows[0].allowed,false);

await db.exec(`alter table auth.users add column email text;alter table auth.users add column phone text;
alter table auth.users add column encrypted_password text;alter table auth.users add column email_confirmed_at timestamptz;
create function public.community_avatars(uuid[])returns jsonb language sql security definer as $$
 select coalesce(jsonb_agg(cp.username),'[]') from community_profiles cp join auth.users u on u.id=cp.user_id
 where cp.user_id=any($1) and cp.visible and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())$$;
create function private.community_activity()returns jsonb language sql security definer as $$
 select coalesce(jsonb_agg(cp.username),'[]') from community_profiles cp join auth.users u on u.id=cp.user_id
 where cp.visible and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now())$$;
create function private.before_age_community_member(text)returns jsonb language sql security definer as $$
 select coalesce(jsonb_agg(cp.username),'[]') from community_profiles cp join auth.users u on u.id=cp.user_id
 where cp.username=$1 and cp.visible and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now())$$;
`);
assert.deepEqual((await db.query('select public.community_avatars(array[$1::uuid]) a',[dealer])).rows[0].a,[]);
await db.exec(readFileSync('supabase/migrations/20261106221738_dealer_profile_visibility.sql','utf8'));
assert.deepEqual((await db.query('select public.community_avatars(array[$1::uuid]) a',[dealer])).rows[0].a,['TheDealer']);
assert.deepEqual((await db.query("select private.before_age_community_member('TheDealer') a")).rows[0].a,['TheDealer']);
assert.deepEqual((await db.query('select private.community_activity() a')).rows[0].a,['TheDealer']);
assert.deepEqual((await db.query('select public.community_avatars(array[$1::uuid]) a',[owner])).rows[0].a,[]);
assert.equal((await db.query("select has_function_privilege('authenticated','private.is_dealer_publisher(uuid)','execute') allowed")).rows[0].allowed,false);
await db.close();
console.log('PASS Dealer backfill, original audit, immutable content, personal posts, future cards, banned login and member impersonation denial');
