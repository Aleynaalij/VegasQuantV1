// Offline-only replay. Input is a private catalog capture, never a database connection or secret.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const input=process.argv[2];
if(!input) throw Error('Usage: node scripts/verification/replay-release-catalog.mjs /private/catalog.json');
const catalogPath=path.resolve(input);
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8'));
if(!Array.isArray(catalog.functions)||!Array.isArray(catalog.views)) throw Error('Invalid catalog shape');
const allowed=new Set(['private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)','claim_social_notification_deliveries()','social_notification_delivery_allowed(uuid,uuid)','edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text)','private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)','private.ruby_home()']);
if(catalog.functions.filter(f=>allowed.has(f.signature)).length!==allowed.size) throw Error('Required target definitions missing');
const source=fs.readFileSync(path.join(root,'tests/sql/ruby-kalshi-source.mjs'),'utf8');
const anchor="await db.exec(fs.readFileSync('supabase/migrations/20261105233947_ruby_kalshi_source_link.sql','utf8'));";
if(!source.includes(anchor)) throw Error('Fixture integration anchor changed');
const injection=`
const catalog=JSON.parse(fs.readFileSync(${JSON.stringify(catalogPath)},'utf8'));
const allowed=new Set(${JSON.stringify([...allowed])});
await db.exec(\`create table private.admin_users(user_id uuid);create table private.memberships(user_id uuid,revoked_at timestamptz,starts_at timestamptz,expires_at timestamptz);create table private.billing_subscriptions(user_id uuid,blocked boolean,paid_until timestamptz);\`);
for(const f of catalog.functions) if(allowed.has(f.signature)) await db.exec(f.definition+';');
for(const v of catalog.views) {
 if(v.name!=='ruby_cards') throw Error('Unexpected captured view');
 await db.exec('create or replace view public.ruby_cards with(security_invoker=true) as '+v.definition);
}
const signatures=['private.emit_notification(uuid,uuid,text,text,uuid,uuid,uuid,text,text)','public.claim_social_notification_deliveries()','public.social_notification_delivery_allowed(uuid,uuid)','private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)','public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text)'];
const metadata=async()=> (await db.query('select oid::regprocedure::text signature,proacl::text,prosecdef,proconfig from pg_proc where oid=any($1::regprocedure[]) order by oid',[signatures])).rows;
const before=await metadata();
await db.exec(fs.readFileSync('supabase/migrations/20261103113707_notification_access_contracts.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261104101722_community_story_clock.sql','utf8'));
`;
const replacement=injection+anchor+"\nassert.deepEqual(await metadata(),before,'Existing target function ACL/security attributes must stay unchanged');\nconsole.log('PASS captured target definitions, view and three migrations; existing ACL/security attributes retained');";
const temporary=path.join(root,'tests/sql',`.release-catalog-${randomUUID()}.mjs`);
try {
 fs.writeFileSync(temporary,source.replace(anchor,replacement));
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,[temporary],{cwd:root,env,encoding:'utf8',timeout:60000});
 // Never echo raw exception payloads: database errors can include captured definitions.
 if(result.status!==0){process.stderr.write('FAIL isolated catalog replay; private diagnostic output withheld\n');process.exitCode=1;}
 else process.stdout.write(result.stdout);
} finally {fs.rmSync(temporary,{force:true});}
