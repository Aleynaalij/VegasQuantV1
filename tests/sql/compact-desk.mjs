import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function private.age_member_allowed() returns boolean language sql as $$ select coalesce(current_setting('test.age',true),'')='yes' $$;
create table public.market_snapshots(id int, observed_at timestamptz,created_at timestamptz);
create table public.audit_events(id int, created_at timestamptz);
create table public.leg_tails(leg_key text,user_id uuid);
create function public.desk_data() returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object(
'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from public.market_snapshots t),
'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t),
'results',jsonb_build_array('unchanged')) $$;
insert into public.market_snapshots select n,now()+n*interval '1 second',now() from generate_series(1,300) n;
insert into public.audit_events select n,now()+n*interval '1 second' from generate_series(1,900) n;
insert into public.leg_tails values ('a','00000000-0000-4000-8000-000000000001'),('a','00000000-0000-4000-8000-000000000002'),('b','00000000-0000-4000-8000-000000000001');
`);
await db.exec(readFileSync('supabase/migrations/20261018000000_compact_desk_and_batch_tails.sql','utf8'));
const full=(await db.query('select public.desk_data() d')).rows[0].d;
const compact=(await db.query('select public.desk_data_compact() d')).rows[0].d;
assert.equal(full.markets.length,300); assert.equal(full.audit.length,900);
assert.equal(compact.markets.length,200); assert.equal(compact.audit.length,100);
assert.equal(compact.markets[0].id,300); assert.equal(compact.audit[0].id,900);
assert.deepEqual(compact.results,full.results);
await assert.rejects(db.query("select * from public.leg_tail_counts(array['a'])"),/Sign in first/);
await db.exec("set test.uid='00000000-0000-4000-8000-000000000001'");
await assert.rejects(db.query("select * from public.leg_tail_counts(array['a'])"),/Age verification required/);
await db.exec("set test.age='yes'");
const counts=(await db.query("select * from public.leg_tail_counts(array['a','a','b','missing',null]) order by leg_key")).rows;
assert.deepEqual(counts.map(r=>[r.leg_key,Number(r.tail_count)]),[['a',2],['b',1],['missing',0]]);
assert.equal((await db.query("select * from public.leg_tail_counts('{}')")).rows.length,0);
await assert.rejects(db.query("select * from public.leg_tail_counts(array(select n::text from generate_series(1,151) n))"),/At most 150/);
const grants=(await db.query("select has_function_privilege('anon','public.leg_tail_counts(text[])','execute') anon, has_function_privilege('authenticated','public.leg_tail_counts(text[])','execute') member")).rows[0];
assert.equal(grants.anon,false); assert.equal(grants.member,true);
await db.close();
console.log('Compact desk retains full history separately; batch counts and access guards pass.');
