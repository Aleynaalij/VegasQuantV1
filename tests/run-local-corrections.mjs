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
const migration='20261001024251_personal_entry_corrections.sql';
for(const file of (await readdir('supabase/migrations')).sort()){
 if(file===migration)break;
 let sql=await readFile('supabase/migrations/'+file,'utf8');
 // Realtime publication is infrastructure outside the isolated engine.
 sql=sql.replace('alter publication supabase_realtime add table public.audit_events;','');
 await db.exec(sql);
}
const names=['record_personal_entry','settle_personal_entries','grade_personal_entry','admin_tail_entries','admin_accounts'];
const originals=await db.query(`select pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname=any($1)`,[names]);
await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
// A synthetic template for the existing rollback-only integration test.
await db.exec(`insert into public.analysis_versions(game_id,version,title,raw_handoff) select id,1,'TEST','TEST' from public.games limit 1;
insert into public.official_picks(game_id,analysis_id,market,selection,recommended_line,direction,odds,stake_cents,model_probability,market_probability,edge,confidence,risk,predicted_close,best_number,bet_grade,fear_index,timing,why_like,why_lose,playable_number,pass_number,book,raw_handoff,known_at_publication)
select g.id,a.id,'Player Prop','TEST',22.5,'over',-114,2000,58.5,53.3,5.2,7.5,5,'TEST','TEST','A',6,'TEST','TEST','TEST','TEST','TEST','TEST','TEST','{}' from public.games g join public.analysis_versions a on a.game_id=g.id limit 1;`);
await db.exec(await readFile('tests/sql/personal-tracking.sql','utf8'));
console.log('PASS existing entry privacy / settlement regression');
await db.exec(await readFile('tests/sql/personal-corrections.sql','utf8'));
console.log('PASS corrections: owner isolation, admin/MFA, approval, rejection, duplicate review, original preservation, effective settlement, settled correction');
// Validate reverting behavior without dropping the appended audit records.
for(const row of originals.rows)await db.exec(row.definition);
await db.exec(await readFile('tests/sql/personal-tracking.sql','utf8'));
console.log('PASS rollback restores prior entry / settlement behavior');
await db.close();
