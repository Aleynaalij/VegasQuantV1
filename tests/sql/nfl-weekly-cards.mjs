import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Sunday NFL cards: staging, the public card read, and the one-per-call 7:00 ET publisher.
const db=new PGlite();
const author='00000000-0000-4000-8000-000000000001';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;create schema cron;
create function auth.uid()returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;
create table cron.job(jobname text,schedule text);create function cron.schedule(n text,s text,c text)returns bigint language sql as $$insert into cron.job values(n,s) returning 1::bigint$$;
create table private.zone_automation(name text primary key,user_id uuid);
insert into private.zone_automation values('nba_threes','${author}');
create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,sport text,kind text,title text,body text,card text,created_at timestamptz default now());
alter table public.community_posts add constraint community_posts_card_check check(card is null or card ~ '^nba-threes:[0-9]{4}-[0-9]{2}-[0-9]{2}$' or card='vq-publication:v1');
-- The real Zone checks: author must be the signed-in user; cards only from automation. (Its 30-second
-- rule uses the wall clock; the publisher's own 35-second spacing is tested against p_now below.)
create function private.prepare()returns trigger language plpgsql as $$begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author';end if;
 if new.card is not null and coalesce(current_setting('vq.automated_post',true),'')<>'on' then raise exception 'Cards are attached by Vegas Quant only';end if;
 return new;end$$;
create trigger prepare_community_post before insert on public.community_posts for each row execute function private.prepare();`);
await db.exec(fs.readFileSync('supabase/migrations/20261108020000_nfl_weekly_cards.sql','utf8'));

const card=(kind,page)=>({kind,page,title:`${kind} ${page}`,body:`${kind} card ${page} text`,payload:{day:'2026-11-08',page,pages:kind==='wr'?2:3,throughWeek:9,[kind==='wr'?'rows':'games']:[{x:1}]}});
const stage=async(day,cards)=>(await db.query('select public.nfl_weekly_cards_stage($1,$2) r',[day,JSON.stringify(cards)])).rows[0].r;
const post=async(at)=>(await db.query('select private.nfl_weekly_cards_post($1) r',[at])).rows[0].r;
const age=()=>db.exec(`update public.community_posts set created_at=created_at-interval '61 seconds'`);

assert.equal((await db.query(`select schedule from cron.job where jobname='nfl-weekly-cards-post'`)).rows[0].schedule,'* 11-13 * * 0');
await assert.rejects(stage('2026-11-07',[card('wr',1)]),/Sunday/);
const set=[card('wr',1),card('wr',2),card('dvp',1),card('dvp',2),card('dvp',3)];
assert.deepEqual(await stage('2026-11-08',set),{status:'STAGED',cards:5});
assert.deepEqual(await stage('2026-11-08',set),{status:'STAGED',cards:5},'restaging replaces the set');
assert.deepEqual((await db.query(`select public.nfl_weekly_card('nfl-dvp:2026-11-08:2') r`)).rows[0].r.page,2);
assert.equal((await db.query(`select public.nfl_weekly_card('nfl-dvp:2026-11-08:9') r`)).rows[0].r,null);
assert.equal((await db.query(`select public.nfl_weekly_card('drop table x') r`)).rows[0].r,null);

assert.equal((await post('2026-11-07T12:05:00Z')).status,'NOT_YET','Saturday');
assert.equal((await post('2026-11-08T11:59:00Z')).status,'NOT_YET','6:59 ET');
const order=[];
for(let i=0;i<5;i++){
 const r=await post('2026-11-08T12:00:00Z');
 assert.equal(r.status,'POSTED',JSON.stringify(r));order.push(r.card);
 await db.exec(`update public.community_posts set created_at='2026-11-08T11:59:50Z' where id='${r.post_id}'`);
 if(i<4){const w=await post('2026-11-08T12:00:00Z');assert.equal(w.status,'WAITING','one card per call, 35 s apart');}
 await age();
}
assert.deepEqual(order,['nfl-dvp:2026-11-08:3','nfl-dvp:2026-11-08:2','nfl-dvp:2026-11-08:1','nfl-wr:2026-11-08:2','nfl-wr:2026-11-08:1'],'first WR card lands on top');
assert.equal((await post('2026-11-08T12:10:00Z')).status,'NOTHING_STAGED');
const posts=(await db.query(`select sport,kind,card,title from public.community_posts order by created_at`)).rows;
assert.equal(posts.length,5);assert.ok(posts.every(p=>p.sport==='nfl'&&p.kind==='talk'));
assert.deepEqual(await stage('2026-11-08',set),{status:'FROZEN'},'a posted day is never restaged');
await assert.rejects(db.query(`insert into public.community_posts(user_id,sport,kind,title,body,card) values('${author}','nfl','talk','x','y','nfl-wr:2026-11-08:1')`),/Sign in|Cards/);
console.log('PASS nfl weekly cards: stage/replace/freeze, public card read, 7:00 ET one-per-call publish order');
await db.close();
