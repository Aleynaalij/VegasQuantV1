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
 const sql=(await readFile('supabase/migrations/'+file,'utf8')).replace('alter publication supabase_realtime add table public.audit_events;','');
 await db.exec(sql);
}
const one='00000000-0000-4000-8000-000000000031',two='00000000-0000-4000-8000-000000000032';
await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${one}','one@test.invalid',now()),('${two}','two@test.invalid',now()); insert into private.memberships(user_id,season,plan,expires_at) values('${one}','2026','full',now()+interval '1 day');`);
const challenge=(await db.query('select id from public.challenges limit 1')).rows[0].id;
async function identity(id){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claims','{"sub":"${id}","aal":"aal1"}',false);`);}
async function rejected(sql){let failed=false;try{await db.exec(sql);}catch{failed=true;}if(!failed)throw Error('Unexpected success: '+sql);}
await identity(one);
await rejected(`select public.start_personal_bankroll('${challenge}',0)`);
await db.exec(`select public.start_personal_bankroll('${challenge}',5000);select public.start_personal_bankroll('${challenge}',5000);`);
let rows=(await db.query('select * from public.personal_challenges')).rows;if(rows.length!==1||rows[0].starting_cents!==5000)throw Error('Duplicate or wrong balance');
await rejected(`select public.start_personal_bankroll('${challenge}',2000)`);
if((await db.query('select * from public.personal_entries')).rows.length)throw Error('Created a wager');
await identity(two);if((await db.query('select * from public.personal_challenges')).rows.length)throw Error('Owner isolation failed');await rejected(`select public.start_personal_bankroll('${challenge}',5000)`);
await db.exec(`reset role;set role anon;`);await rejected(`select public.start_personal_bankroll('${challenge}',5000)`);
console.log('PASS custom bankroll: member-only, private, idempotent, no overwrites, no wager created');await db.close();
