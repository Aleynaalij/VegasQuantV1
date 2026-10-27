// Isolated PostgreSQL (PGlite). No production credentials or network database.
// Install @electric-sql/pglite@0.3.14 in a temporary directory, then set VQ_PGLITE_MODULE to its dist/index.js.
import {readFile,readdir,writeFile} from 'node:fs/promises';
const {PGlite}=await import(process.env.VQ_PGLITE_MODULE||'@electric-sql/pglite');
const db=new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth; create schema extensions;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
grant usage on schema auth to anon,authenticated,service_role;
-- Local-only seed helper; not used by correction logic.
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(substr(md5(random()::text),1,n*2),'hex')$$;`);
for(const file of (await readdir('supabase/migrations')).sort()) {
 if(file.endsWith('_schedule_source_sync.sql')) continue;
 const sql=(await readFile('supabase/migrations/'+file,'utf8')).replace('alter publication supabase_realtime add table public.audit_events;','');
 await db.exec(sql);
}
const one='00000000-0000-4000-8000-000000000011',two='00000000-0000-4000-8000-000000000012';
await db.exec(`insert into auth.users(id,email) values ('${one}','one@test.invalid'),('${two}','two@test.invalid');`);
const challenge=(await db.query('select id from public.challenges limit 1')).rows[0].id;
await db.exec(`update public.challenge_stages set status='OFFICIAL PLAY' where challenge_id='${challenge}' and stage_number=1;`);
async function identity(id){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","aal":"aal1"}',false);`);}
async function rejected(sql){let failed=false;try{await db.exec(sql);}catch{failed=true;}if(!failed)throw Error('Unexpected access: '+sql);}
await identity(one);
const join=`select public.set_challenge_run('${challenge}','follow',false)`;
await db.exec(join);await db.exec(join);
if((await db.query('select * from public.challenge_runs')).rows.length!==1)throw Error('Duplicate join');
await db.exec(`select public.check_in_challenge('${challenge}',1);select public.check_in_challenge('${challenge}',1);`);
if((await db.query('select * from public.challenge_checkins')).rows.length!==1)throw Error('Duplicate check-in');
await rejected(`select public.check_in_challenge('${challenge}',2)`);
await rejected(`update public.challenge_runs set user_id='${two}'`);
await rejected(`delete from public.challenge_checkins`);
await rejected(`select public.set_challenge_run('${challenge}','bogus',false)`);
await identity(two);
if((await db.query('select * from public.challenge_runs')).rows.length||(await db.query('select * from public.challenge_checkins')).rows.length)throw Error('Owner isolation failed');
await rejected(`select public.check_in_challenge('${challenge}',1)`);
await db.exec(`select public.set_challenge_run('${challenge}','track',true)`);
if(Number((await db.query(`select public.challenge_community_count('${challenge}') as n`)).rows[0].n)!==1)throw Error('Private participant counted');
await db.exec(`select public.set_challenge_run('${challenge}','follow',false)`);
if(Number((await db.query(`select public.challenge_community_count('${challenge}') as n`)).rows[0].n)!==0)throw Error('Opt out not applied');
await db.exec('reset role;');
if((await db.query('select * from public.personal_entries')).rows.length)throw Error('Joining created cash entries');
await db.exec('set role anon;');await rejected('select * from public.challenge_runs');await rejected(join);
await db.query(`select public.challenge_community_count('${challenge}')`);
console.log('PASS joining/check-ins: free member access, idempotency, future-stage rejection, ownership, immutable check-ins, opt-in counts, no cash entries, anonymous isolation');
await db.close();
