import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const viewer='00000000-0000-4000-8000-000000000001',shown='00000000-0000-4000-8000-000000000002',hidden='00000000-0000-4000-8000-000000000003',blocked='00000000-0000-4000-8000-000000000004',unconfirmed='00000000-0000-4000-8000-000000000005',banned='00000000-0000-4000-8000-000000000006';
await db.exec(`create role anon;create role authenticated;create schema private;create schema auth;
create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz);
create table public.community_profiles(user_id uuid primary key,username text,avatar text,visible boolean);
create table public.member_blocks(user_id uuid,target_user_id uuid);
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true) is distinct from 'no'$$;
create function private.community_member_allowed(target uuid)returns boolean language sql as $$select not exists(select 1 from public.member_blocks where (user_id=auth.uid() and target_user_id=target) or (target_user_id=auth.uid() and user_id=target))$$;
insert into auth.users values('${viewer}',now(),null),('${shown}',now(),null),('${hidden}',now(),null),('${blocked}',now(),null),('${unconfirmed}',null,null),('${banned}',now(),now()+interval '1 day');
insert into public.community_profiles values('${shown}','shown','data:a',true),('${hidden}','hidden','data:b',false),('${blocked}','blocked','data:c',true),('${unconfirmed}','new','data:d',true),('${banned}','gone','data:e',true);
insert into public.member_blocks values('${viewer}','${blocked}');`);
await db.exec(fs.readFileSync('supabase/migrations/20261029200000_community_avatars.sql','utf8'));
const call=async()=>(await db.query(`select public.community_avatars(array['${shown}','${hidden}','${blocked}','${unconfirmed}','${banned}']::uuid[]) r`)).rows[0].r;
// Signed out: nothing.
assert.deepEqual(await call(),[]);
await db.exec(`set app.uid='${viewer}'`);
// Only the visible, confirmed, unbanned, unblocked author's photo comes back.
assert.deepEqual(await call(),[{user_id:shown,avatar:'data:a'}]);
// Viewers who fail the age gate get nothing.
await db.exec(`set app.age='no'`);
assert.deepEqual(await call(),[]);
console.log('PASS community_avatars returns only visible, confirmed, unbanned, unblocked authors to signed-in, age-verified viewers');
await db.close();
