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

const one='00000000-0000-4000-8000-000000000091',two='00000000-0000-4000-8000-000000000092';
await db.exec(`insert into auth.users(id,email,email_confirmed_at) values ('${one}','admin@test.invalid',now()),('${two}','member@test.invalid',now());insert into private.admin_users(user_id) values('${one}');`);
async function identity(id,aal='aal1'){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claims','{"sub":"${id}","aal":"${aal}"}',false);`);}
async function reject(fn){let failed=false;try{await fn()}catch{failed=true}if(!failed)throw Error('Expected rejection');}
const game=(await db.query('select id from public.games limit 1')).rows[0].id;
const update={status:'MONITORING',update_type:'INITIAL ANALYSIS',summary:'Synthetic test only',raw_handoff:'Synthetic local fixture',targets:[{market_type:'Total',selection:'Synthetic target',status:'WATCH',current_number:'40',current_odds:-110}],weather:{wind:'Synthetic 5 mph'}};
await identity(one);await reject(()=>db.query('select public.publish_matchup($1,$2,$3)',[game,update,crypto.randomUUID()]));
await identity(one,'aal2');const request=crypto.randomUUID();const a=(await db.query('select public.publish_matchup($1,$2,$3) as r',[game,update,request])).rows[0].r;
await db.query('select public.publish_matchup($1,$2,$3)',[game,update,request]);
const b=(await db.query('select public.publish_matchup($1,$2,$3) as r',[game,{status:'PASS',update_type:'MARKET UPDATE',summary:'Changed',what_changed:'Number changed',response:'Pass',raw_handoff:'Synthetic delta',targets:[]},crypto.randomUUID()])).rows[0].r;
if(b.version!==a.version+1)throw Error('Version not sequential');
const history=(await db.query('select intelligence from public.analysis_versions where game_id=$1 order by version',[game])).rows;
if(history.at(-2).intelligence.targets.length!==1||history.at(-1).intelligence.targets.length!==0||history.at(-1).intelligence.weather.wind!=='Synthetic 5 mph')throw Error('History/carryforward failed');
await reject(()=>db.query('update public.target_legs set selection=$1',['Rewrite']));
await identity(two);if((await db.query('select * from public.target_legs')).rows.length)throw Error('Unpaid research exposed');
await reject(()=>db.query('select public.ingest_source($1)',[{provider:'fake'}]));
await db.exec('reset role');
const oid=crypto.randomUUID();const order=(await db.query("select public.billing_order($1,$2,$3,now()+interval '32 days') as r",[oid,two,'monthly'])).rows[0].r;
if(order.amount!==500)throw Error('Wrong monthly price');
await reject(()=>db.query("select public.billing_order($1,$2,$3,now()+interval '32 days')",[crypto.randomUUID(),two,'half']));
const payload={id:'sub_local',order_id:oid,customer_id:'cus_local',status:'active',cancel_at_period_end:false,event_id:'evt_1',event_type:'invoice.paid',invoice_id:'in_local',payment_intent:'pi_local',amount_paid:500,period_end:new Date(Date.now()+86400000).toISOString()};
await db.query('select public.billing_subscription_sync($1)',[payload]);await db.query('select public.billing_subscription_sync($1)',[payload]);
await identity(two);if(!(await db.query('select private.has_membership() as ok')).rows[0].ok)throw Error('Paid access absent');
await reject(()=>db.query('select public.billing_account($1)',[one]));
await db.exec('reset role');await db.query('select public.billing_revoke($1,$2,$3)',['pi_local','evt_refund','charge.refunded']);await db.query('select public.billing_subscription_sync($1)',[{...payload,event_id:'evt_late'}]);
await identity(two);if((await db.query('select private.has_membership() as ok')).rows[0].ok)throw Error('Delayed event regranted refunded access');
console.log('PASS: immutable versions, carryforward, target separation, RLS, MFA, prices, duplicate invoices and refund ordering');await db.close();
