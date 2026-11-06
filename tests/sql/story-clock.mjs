import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 grant usage on schema public,auth to authenticated,anon;`);
 await db.exec(fs.readFileSync(process.env.VQ_STORY_CLOCK_MIGRATION || 'supabase/migrations/20261104101722_community_story_clock.sql','utf8'));
 const grants=(await db.query(`select has_function_privilege('anon','public.community_story_clock()','execute') anon,
 has_function_privilege('authenticated','public.community_story_clock()','execute') member,
 (select prosecdef from pg_proc where oid='public.community_story_clock()'::regprocedure) definer`)).rows[0];
 assert.deepEqual(grants,{anon:false,member:true,definer:false});
 await db.exec('set role anon');
 await assert.rejects(()=>db.query('select public.community_story_clock()'),/permission denied/);
 await db.exec('reset role;set role authenticated');
 assert.equal((await db.query('select public.community_story_clock() value')).rows[0].value,null);
 await db.exec(`select set_config('test.uid','00000000-0000-4000-8000-000000000001',false)`);
 const sample=(await db.query('select public.community_story_clock() value, statement_timestamp() sampled')).rows[0];
 assert.equal(sample.value.version,1);
 assert.deepEqual(Object.keys(sample.value).sort(),['server_now','version']);
 assert.equal(Date.parse(sample.value.server_now),new Date(sample.sampled).getTime());
 // Clock is statement-time, not a transaction-start timestamp that can age while idle.
 await db.exec('begin');
 await db.query('select now()');
 const timing=(await db.query('select public.community_story_clock() value, statement_timestamp() sampled')).rows[0];
 assert.equal(Date.parse(timing.value.server_now),new Date(timing.sampled).getTime());
 await db.exec('rollback');
 console.log('PASS story clock: version/time, no identity/content, invoker, member/no-JWT/anon grants');
} finally { await db.close(); }
