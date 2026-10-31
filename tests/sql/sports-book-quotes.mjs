// Other books' NHL/college quotes: server-only ingest, strict validation, member-only reads, FanDuel
// markets untouched. Run: node tests/sql/sports-book-quotes.mjs
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.is_admin()returns boolean language sql as $$select current_setting('app.admin',true)='yes'$$;
create function private.has_membership()returns boolean language sql as $$select current_setting('app.member',true)='yes'$$;
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table public.feed_runs(provider text,status text,details jsonb,created_at timestamptz default now());`);
await db.exec(readFileSync('supabase/migrations/20261031145407_multisport_backend.sql','utf8'));
await db.exec(readFileSync('supabase/migrations/20261031200000_sports_book_quotes.sql','utf8'));
const now=Date.now(),at=new Date(now-5*60000).toISOString();
const body='{"fixture":true}',source={url:'https://example.invalid/fixture',body,sha256:createHash('sha256').update(body).digest('hex'),retrieved_at:new Date(now).toISOString()};
const game={sport:'nhl',provider_id:'123',slug:'sample',start_time:new Date(now+3600000).toISOString(),start_time_tbd:false,completed:false,away:{id:'a',provider_id:'1',name:'A'},home:{id:'b',provider_id:'2',name:'B'},source:{...source,body:undefined}};
const rpc=async(n,p)=>(await db.query(`select public.${n}($1) r`,[p])).rows[0].r;
await rpc('ingest_sports',{sport:'nhl',source,games:[game]});
const id=(await db.query('select id from public.sports_games')).rows[0].id;
const snap={game_id:id,book:'DraftKings',market:'totals',observed_at:at,outcomes:[{name:'Over',point:6.5,price:-105},{name:'Under',point:6.5,price:-115}]};
assert.equal((await rpc('ingest_sports_books',{sport:'nhl',snapshots:[snap,snap]})).book_quotes_inserted,1,'identical snapshot stored once');
const row=(await db.query('select book,market,payload from public.sports_book_quotes')).rows[0];
assert.equal(row.payload.book,'DraftKings');assert.equal(row.payload.market,'totals');assert.equal(row.payload.outcomes.length,2);
// Validation: unknown or FanDuel book, wrong sport market, stale or future time, bad price, unknown game.
for(const [bad,re] of [
 [{...snap,book:'FanDuel'},/Invalid or stale/],[{...snap,book:'Bovada'},/Invalid or stale/],
 [{...snap,market:'spreads'},/Invalid or stale/],
 [{...snap,observed_at:new Date(now-45*60000).toISOString()},/Invalid or stale/],
 [{...snap,observed_at:new Date(now+30*60000).toISOString()},/Invalid or stale/],
 [{...snap,outcomes:[{name:'Over',point:6.5,price:-50}]},/Invalid book price/],
 [{...snap,outcomes:[{name:'Over',point:6.5,price:-110.5}]},/Invalid book price/],
 [{...snap,outcomes:'x'},/Invalid or stale/],
 [{...snap,game_id:'00000000-0000-0000-0000-000000000000'},/Unknown quote game/],
])await assert.rejects(rpc('ingest_sports_books',{sport:'nhl',snapshots:[bad]}),re);
await assert.rejects(rpc('ingest_sports_books',{sport:'ncaab',snapshots:[snap]}),/Unknown quote game/);
await assert.rejects(rpc('ingest_sports_books',{sport:'nfl',snapshots:[]}),/Invalid sport/);
// FanDuel's market table is untouched.
assert.equal((await db.query('select count(*)::int n from public.sports_markets')).rows[0].n,0);
// Clients cannot write; anonymous and non-members read nothing; age-verified members read quotes.
for(const role of ['anon','authenticated'])
 assert.equal((await db.query(`select has_function_privilege('${role}','public.ingest_sports_books(jsonb)','execute') p`)).rows[0].p,false,role);
assert.equal((await db.query("select has_table_privilege('authenticated','public.sports_book_quotes','insert') p")).rows[0].p,false);
await db.exec('set role anon');
assert.equal((await db.query('select count(*)::int n from public.sports_book_quotes')).rows[0].n,0,'anon');
await db.exec('reset role');await db.exec("set app.member='yes';set app.age=''");await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int n from public.sports_book_quotes')).rows[0].n,0,'not age verified');
await db.exec('reset role');await db.exec("set app.age='yes'");await db.exec('set role authenticated');
assert.equal((await db.query('select count(*)::int n from public.sports_book_quotes')).rows[0].n,1,'member');
await db.exec('reset role');
// Old snapshots are pruned on the next ingest.
await db.query("insert into public.sports_book_quotes(game_id,book,market,observed_at,payload,fingerprint) values($1,'BetMGM','h2h',now()-interval '2 days',$2,'old')",[id,{book:'BetMGM',market:'h2h',outcomes:[]}]);
await rpc('ingest_sports_books',{sport:'nhl',snapshots:[]});
assert.equal((await db.query("select count(*)::int n from public.sports_book_quotes where fingerprint='old'")).rows[0].n,0);
console.log('sports book quotes: server-only ingest, validation, member-only reads, pruning pass');
