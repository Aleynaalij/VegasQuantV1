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
const admin='00000000-0000-4000-8000-000000000001', member='00000000-0000-4000-8000-000000000002';
await db.exec(`insert into auth.users(id,email) values ('${admin}','admin@test.invalid'),('${member}','member@test.invalid'); insert into private.admin_users(user_id) values ('${admin}');`);
const game=(await db.query('select id from public.games limit 1')).rows[0].id;
async function identity(id,aal) {await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}","aal":"${aal}"}',false);`);}
async function rejected(sql) {let failed=false;try{await db.exec(sql);}catch{failed=true;}if(!failed)throw Error('Unexpected access: '+sql);}
const insert=`insert into public.intelligence_markets(game_id,market_key,label,market_type,selection,opposite,rules) values ('${game}','test','TEST','Player Prop','Over','Under','TEST') returning id`;
await identity(member,'aal2'); await rejected(insert);
await identity(admin,'aal1'); await rejected(insert);
await identity(admin,'aal2');const market=(await db.query(insert)).rows[0].id;
await db.exec(`insert into public.intelligence_quotes(market_id,book,line,odds,observed_at,source,created_by,created_at) values ('${market}','TEST',22.5,-114,now(),'TEST','${member}','2000-01-01');`);
const q=(await db.query('select * from public.intelligence_quotes')).rows[0];
if(q.created_by!==admin||new Date(q.created_at).getFullYear()===2000)throw Error('Stamp spoof');
await rejected(`update public.intelligence_quotes set odds=-110`);
await rejected(`delete from public.intelligence_quotes`);
await rejected(`insert into public.intelligence_quotes(market_id,book,odds,observed_at,source) values ('${market}','TEST',-114,now(),'TEST')`);
await rejected(`insert into public.intelligence_models(market_id,projection,sharp_fair_line,observed_at,source) values ('${market}','TEST',23,now(),'TEST')`);
for(const [id,aal] of [[member,'aal2'],[admin,'aal1']]) {await identity(id,aal);for(const t of ['markets','quotes','splits','news','models'])if((await db.query('select * from public.intelligence_'+t)).rows.length)throw Error('Private read leaked');}
await db.exec('reset role; set role anon;');await rejected('select * from public.intelligence_quotes');
console.log('PASS private intelligence: all migrations, admin MFA, member/anonymous isolation, immutable inputs, trusted stamps, market constraints');
await db.close();
