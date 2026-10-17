import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema private; create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create function private.age_member_allowed() returns boolean language sql as $$ select true $$;
create table public.market_snapshots(id int, observed_at timestamptz,created_at timestamptz);
create table public.audit_events(id int, created_at timestamptz);
create table public.analysis_versions(id int, game_id int, version int, created_at timestamptz);
create table public.leg_tails(leg_key text,user_id uuid);
create function public.desk_data() returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object(
'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from public.market_snapshots t),
'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from public.analysis_versions t),
'results',jsonb_build_array('unchanged'),
'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t)) $$;
insert into public.market_snapshots select n,now()+n*interval '1 second',now() from generate_series(1,5) n;
insert into public.audit_events select n,now()+n*interval '1 second' from generate_series(1,300) n;
-- Game 1: three versions; game 2: two versions.
insert into public.analysis_versions values (1,1,1,now()-interval '3 hours'),(2,1,2,now()-interval '2 hours'),(3,1,3,now()-interval '1 hour'),
 (4,2,1,now()-interval '5 hours'),(5,2,2,now()-interval '30 minutes');
`);
await db.exec(readFileSync('supabase/migrations/20261018000000_compact_desk_and_batch_tails.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261018010000_desk_compact_latest_analyses.sql','utf8'));
const full=(await db.query('select public.desk_data() d')).rows[0].d;
const compact=(await db.query('select public.desk_data_compact() d')).rows[0].d;
// Game pages keep every version and the full audit list.
assert.equal(full.analyses.length,5); assert.equal(full.audit.length,300);
// Home/Records: the latest version per game, newest first, and no audit list.
assert.deepEqual(compact.analyses.map(a=>[a.game_id,a.version]),[[2,2],[1,3]]);
assert.deepEqual(compact.audit,[]);
assert.equal(compact.markets.length,5); assert.deepEqual(compact.results,full.results);
// Rerunning against an unexpected definition refuses rather than half-rewriting.
await assert.rejects(db.exec(readFileSync('supabase/migrations/20261018010000_desk_compact_latest_analyses.sql','utf8')),/refusing a partial rewrite/);
await db.close();
console.log('Compact desk keeps the latest analysis per game and drops the unused audit list.');
