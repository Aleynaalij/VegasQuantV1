import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const owner='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;create schema auth;create schema cron;
create function auth.uid()returns uuid language sql as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'))::uuid$$;
create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
create table private.admin_users(user_id uuid primary key);
create function private.age_member_allowed()returns boolean language sql as $$select true$$;
create function private.immutable()returns trigger language plpgsql as $$begin raise exception 'immutable';end$$;
create table cron.job(jobname text);create function cron.schedule(n text,s text,c text)returns bigint language sql as $$insert into cron.job values(n) returning 1::bigint$$;
create function cron.unschedule(n text)returns boolean language sql as $$delete from cron.job where jobname=n returning true$$;
create table public.nba_games(id uuid primary key,provider_id text unique,away_team text,home_team text,away_abbreviation text,home_abbreviation text,tipoff timestamptz,season integer,season_type integer);
create table public.nba_game_results(game_id uuid primary key references public.nba_games(id));
create table public.nba_player_results(game_id uuid,athlete_id text,player text,team text,played boolean,threes integer,primary key(game_id,athlete_id));
create table public.community_profiles(user_id uuid,username text);
create table public.community_reactions(post_id uuid,user_id uuid);create table public.community_post_comments(post_id uuid);create table public.member_follows(user_id uuid,target_user_id uuid);
create table public.community_posts(id uuid primary key default gen_random_uuid(),user_id uuid,sport text,kind text,title text,body text,created_at timestamptz default now());
-- The real Zone checks: the author must be the signed-in user.
create function private.prepare()returns trigger language plpgsql as $$begin if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author';end if;return new;end$$;
create trigger prepare_community_post before insert on public.community_posts for each row execute function private.prepare();
create table public.sent(recipient uuid,post uuid);
create function private.emit_notification(r uuid,a uuid,t text,k text,x uuid,p uuid,c uuid,m text,l text)returns void language sql as $$insert into public.sent values(r,p)$$;
create function private.zone_post_notify()returns trigger language plpgsql as $$begin return new;end$$;
create trigger zone_post_notify after insert on public.community_posts for each row execute function private.zone_post_notify();
insert into auth.users values('${owner}',now()),('${member}',now());insert into private.admin_users values('${owner}');`);
await db.exec(fs.readFileSync('supabase/migrations/20261029001000_nba_three_point_volume.sql','utf8').replace(/^create extension.*$/gm,''));
await db.exec(fs.readFileSync('supabase/migrations/20261029010000_nba_threes_post_skip_mismatch.sql','utf8'));
await db.exec(fs.readFileSync('supabase/migrations/20261029160000_nba_threes_card.sql','utf8'));

// Three finished games for the Knicks before today, one today vs the Bulls; another team's game too.
const today=(await db.query(`select (now() at time zone 'America/New_York')::date d`)).rows[0].d.toISOString().slice(0,10);
const at=(daysAgo,h=19)=>`(('${today}'::date - ${daysAgo}) + time '${h}:00') at time zone 'America/New_York'`;
await db.exec(`insert into public.nba_games values
 ('00000000-0000-4000-8000-0000000000a1','1','New York Knicks','Boston Celtics','NY','BOS',${at(3)},2027,2),
 ('00000000-0000-4000-8000-0000000000a2','2','Miami Heat','New York Knicks','MIA','NY',${at(2)},2027,2),
 ('00000000-0000-4000-8000-0000000000a3','3','New York Knicks','Orlando Magic','NY','ORL',${at(1)},2027,2),
 ('00000000-0000-4000-8000-0000000000a4','4','Chicago Bulls','New York Knicks','CHI','NY',${at(0)},2027,2),
 ('00000000-0000-4000-8000-0000000000a5','5','Utah Jazz','Phoenix Suns','UTA','PHX',${at(1)},2026,2),
 ('00000000-0000-4000-8000-0000000000a6','6','Los Angeles Lakers','Sacramento Kings','LAL','SAC',${at(2)},2027,2);
insert into public.nba_game_results values('00000000-0000-4000-8000-0000000000a1'),('00000000-0000-4000-8000-0000000000a2'),('00000000-0000-4000-8000-0000000000a3'),('00000000-0000-4000-8000-0000000000a6');
insert into public.nba_player_results values
 ('00000000-0000-4000-8000-0000000000a1','10','Jalen Brunson','New York Knicks',true,3),('00000000-0000-4000-8000-0000000000a1','11','Mikal Bridges','New York Knicks',true,2),('00000000-0000-4000-8000-0000000000a1','12','Bench Guy','New York Knicks',false,0),
 ('00000000-0000-4000-8000-0000000000a2','10','Jalen Brunson','New York Knicks',true,4),('00000000-0000-4000-8000-0000000000a2','11','Mikal Bridges','New York Knicks',true,5),
 ('00000000-0000-4000-8000-0000000000a3','10','Jalen Brunson','New York Knicks',true,2),('00000000-0000-4000-8000-0000000000a3','11','Mikal Bridges','New York Knicks',true,2),
 ('00000000-0000-4000-8000-0000000000a6','30','LeBron James','Los Angeles Lakers',true,2);`);
const rpc=async p=>(await db.query(`select private.record_nba_three_attempts($1::jsonb) r`,[JSON.stringify(p)])).rows[0].r;
const line=(id,threes,att)=>({athlete_id:id,threes,three_attempts:att});

// Not yet recorded, unknown game, a made count that disagrees, and a DNP with attempts are all refused.
assert.equal((await rpc({provider_id:'4',players:[]})).status,'PENDING');
assert.equal((await rpc({provider_id:'999',players:[]})).status,'UNKNOWN_GAME');
assert.deepEqual(await rpc({provider_id:'1',players:[line('10',3,8),line('11',1,6),line('12',0,0)]}),{status:'MISMATCH',players:1});
assert.equal((await rpc({provider_id:'1',players:[line('10',3,8),line('11',2,6),line('12',0,2)]})).status,'MISMATCH');
assert.equal((await rpc({provider_id:'1',players:[line('10',3,2),line('11',2,6),line('12',0,0)]})).status,'MISMATCH');
// A game that failed is not offered again for 12 hours; the others are.
assert.deepEqual((await db.query(`select provider_id from private.nba_three_attempts_missing(30) order by provider_id`)).rows.map(r=>r.provider_id),['2','3','6']);
// Matching reads record once; a second read is a no-op and rows are immutable.
assert.deepEqual(await rpc({provider_id:'1',players:[line('10',3,8),line('11',2,6),line('12',0,0)]}),{status:'RECORDED',players:3});
assert.equal((await rpc({provider_id:'1',players:[line('10',3,9),line('11',2,6),line('12',0,0)]})).status,'RECORDED');
await assert.rejects(db.query(`update public.nba_player_three_attempts set attempts=1`),/immutable/);

// The post waits until every recorded game this season has attempts.
assert.equal((await db.query(`select private.nba_threes_post() r`)).rows[0].r.status,'WAITING');
await rpc({provider_id:'2',players:[line('10',4,10),line('11',5,9)]});
await rpc({provider_id:'3',players:[line('10',2,7),line('11',2,5)]});
// Game 6 was corrected by ESPN after it was recorded: it never gets attempts, but no longer holds the post back.
assert.equal((await rpc({provider_id:'6',players:[line('30',3,6)]})).status,'MISMATCH');
const r=(await db.query(`select private.nba_threes_post() r`)).rows[0].r;
assert.equal(r.status,'POSTED');
const post=(await db.query(`select * from public.community_posts`)).rows[0];
assert.equal(post.user_id,owner);assert.equal(post.sport,'nba');assert.equal(post.kind,'talk');
assert.match(post.title,/^3-point volume · \w{3} \w{3} \d{1,2}$/);
// Brunson 8.3 att / 3.0 made / 36%; Bridges 6.7 att / 3.0 made / 45%; the bench player and other seasons are left out.
assert.match(post.body,/Today's slate: 1 game\./);
assert.match(post.body,/Most 3s attempted per game\n1\. Jalen Brunson \(NY\) 8\.3 att · 3\.0 made · 36%\n2\. Mikal Bridges \(NY\) 6\.7 att · 3\.0 made · 45%/);
assert.match(post.body,/Most 3s made per game\n1\. Jalen Brunson \(NY\) 3\.0 made · 8\.3 att · 36%\n2\. Mikal Bridges/);
assert.doesNotMatch(post.body,/Bench Guy/);
assert.match(post.body,/Research only, not picks\./);
// The post carries today's card, and the card data matches the post.
assert.equal(post.card,`nba-threes:${today}`);
const card=(await db.query(`select public.nba_threes_card($1::date) c`,[today])).rows[0].c;
assert.deepEqual(card.games,[{away:'CHI',home:'NY',tipoff:card.games[0].tipoff}]);
assert.deepEqual(card.attempted.map(l=>[l.player,l.team,l.games,Number(l.tpa),Number(l.tpm)]),[['Jalen Brunson','NY',3,8.3,3],['Mikal Bridges','NY',3,6.7,3]]);
assert.deepEqual(card.made.map(l=>l.player),['Jalen Brunson','Mikal Bridges']);
assert.equal((await db.query(`select public.nba_threes_card(current_date+30) c`)).rows[0].c,null);
// No notifications for the automated post, the impersonation does not leak, and it posts once a day.
assert.equal((await db.query(`select count(*)::int n from public.sent`)).rows[0].n,0);
assert.equal((await db.query(`select auth.uid() u`)).rows[0].u,null);
assert.equal((await db.query(`select private.nba_threes_post() r`)).rows[0].r.status,'ALREADY_POSTED');

// The feed lists both sports with 'all' and one sport otherwise.
await db.exec(`set request.jwt.claim.sub='${member}';insert into public.community_posts(user_id,sport,kind,title,body) values('${member}','nfl','talk','t','NFL post');reset request.jwt.claim.sub;`);
// A member's own post still notifies (the owner here).
assert.deepEqual((await db.query(`select recipient from public.sent`)).rows,[{recipient:owner}]);
// Members cannot attach a card to their own post.
await assert.rejects(db.exec(`set request.jwt.claim.sub='${member}';insert into public.community_posts(user_id,sport,kind,title,body,card) values('${member}','nfl','talk','t','x','nba-threes:${today}')`),/Cards are attached by Vegas Quant only/);
await db.exec(`reset request.jwt.claim.sub`);
const feed=async s=>(await db.query(`select jsonb_array_length(public.community_feed($1,20,false)) n`,[s])).rows[0].n;
assert.deepEqual([await feed('all'),await feed('nfl'),await feed('nba')],[2,1,1]);
assert.deepEqual((await db.query(`select jobname from cron.job`)).rows,[{jobname:'nba-threes-post'}]);
console.log('PASS 3-point attempts record only against matching recorded box scores; the daily Zone post waits for complete data, posts once as the owner, sends no notifications; feed "all" lists both sports');
await db.close();
