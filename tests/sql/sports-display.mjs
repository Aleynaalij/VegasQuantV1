import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
// Same harness as tests/sql/sports-backend.mjs, then the display migration on top.
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;
grant usage on schema private,auth to anon,authenticated,service_role;
create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
create function private.is_admin()returns boolean language sql as $$select current_setting('app.admin',true)='yes'$$;
create function private.has_membership()returns boolean language sql as $$select current_setting('app.member',true)='yes'$$;
create function private.age_member_allowed()returns boolean language sql as $$select current_setting('app.age',true)='yes'$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table public.feed_runs(provider text,status text,details jsonb,created_at timestamptz default now());
create table public.community_posts(user_id uuid,sport text,kind text,title text,body text,legs text[]);`);
for (const f of ['20261031145407_multisport_backend.sql','20261031152818_multisport_publishing_access.sql','20261031170000_sports_display.sql'])
  await db.exec(readFileSync(`supabase/migrations/${f}`,'utf8'));
const now=Date.now(),iso=(ms)=>new Date(now+ms).toISOString();
const body='{"fixture":true}',source={url:'https://example.invalid/fixture',body,sha256:createHash('sha256').update(body).digest('hex'),retrieved_at:iso(0)};
const game={sport:'nhl',provider_id:'123',slug:'sample',start_time:iso(8*3600000),start_time_tbd:false,completed:false,away:{id:'a',provider_id:'1',name:'A'},home:{id:'b',provider_id:'2',name:'B'},source:{...source,body:undefined}};
const rpc=async(n,p)=>(await db.query(`select public.${n}($1) r`,[p])).rows[0].r;
await rpc('ingest_sports',{sport:'nhl',source,games:[game]});
const id=(await db.query('select id from public.sports_games')).rows[0].id;
// Observed 2 hours ago, expired 90 minutes ago: the latest quote for a game 8 hours out.
const m={game_id:id,sport:'nhl',book:'FanDuel',market:'h2h',period:'full_game',selection:'A',player:null,athlete_id:null,side:'away',direction:null,line:null,odds:-110,observed_at:iso(-60000),expires_at:iso(1740000),settlement:'including_overtime_shootout',settlement_note:'Full game OT/SO',source:{...source,body:undefined}};
await rpc('ingest_sports',{sport:'nhl',source,markets:[m,{...m,selection:'B',side:'home',odds:-105}]});
// Age them (test only; quotes are immutable in use): observed 2 hours ago, expired 90 minutes ago.
await db.exec(`alter table public.sports_markets disable trigger user;
update public.sports_markets set observed_at=now()-interval '2 hours',expires_at=now()-interval '90 minutes',payload=payload||jsonb_build_object('observed_at',to_jsonb(now()-interval '2 hours'),'expires_at',to_jsonb(now()-interval '90 minutes'));
alter table public.sports_markets enable trigger user;`);
await db.exec("set app.member='yes';set app.age='yes'");await db.exec('set role authenticated');
let page=(await db.query("select public.sports_game('nhl','sample') r")).rows[0].r;
assert.equal(page.markets.length,2,'latest pregame quotes stay visible after expiry');
assert.ok(page.markets.every((q)=>Date.parse(q.expires_at)<now),'expiry is reported, not hidden');
page=(await db.query("select public.sports_slate('nhl',7) r")).rows[0].r;
assert.equal(page.markets.length,2);
// A newer observation replaces the older one per game and market.
await db.exec('reset role');
await rpc('ingest_sports',{sport:'nhl',source,markets:[{...m,odds:-120,observed_at:iso(-60000),expires_at:iso(1740000)}]});
await db.exec('set role authenticated');
page=(await db.query("select public.sports_game('nhl','sample') r")).rows[0].r;
assert.deepEqual(page.markets.map((q)=>q.odds),[-120]);
// Selections carry their bound quote; author stays hidden; anonymous readers get no protected rows.
await db.exec('reset role');
const mid=(await db.query("select id from public.sports_markets where payload->>'odds'='-120'")).rows[0].id;
await db.exec(`insert into auth.users values('00000000-0000-4000-8000-000000000009');set app.uid='00000000-0000-4000-8000-000000000009';set app.admin='yes'`);
await db.query('select public.sports_publish_selection($1,$2,$3,$4)',[mid,'A to win','Twenty characters of reasoning at least.','Twenty characters of risk at least, yes.']);
await db.exec('set role authenticated');
page=(await db.query("select public.sports_slate('nhl',7) r")).rows[0].r;
assert.equal(page.selections.length,1);assert.equal(page.selections[0].market.odds,-120);assert.equal(page.selections[0].market.id,mid);assert.equal('author_id' in page.selections[0],false);
await db.exec('reset role');await db.exec("reset app.member");await db.exec('set role anon');
page=(await db.query("select public.sports_slate('nhl',7) r")).rows[0].r;
assert.equal(page.markets.length,0);assert.equal(page.selections.length,0);assert.equal(page.games.length,1);
// Started games show no quotes.
await db.exec('reset role');await db.exec("set app.member='yes'");await db.exec("update public.sports_games set start_time=now()-interval '1 minute'");await db.exec('set role authenticated');
page=(await db.query("select public.sports_game('nhl','sample') r")).rows[0].r;
assert.equal(page.markets.length,0);
console.log('PASS sports display: latest pregame quotes survive expiry, newest wins, selections carry their quote, gates hold');
await db.close();
