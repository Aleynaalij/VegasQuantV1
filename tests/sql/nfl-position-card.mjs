import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
const dealer='00000000-0000-4000-8000-000000000001', member='00000000-0000-4000-8000-000000000002',game='00000000-0000-4000-8000-000000000003', post='00000000-0000-4000-8000-000000000004';
await db.exec(`create role anon;create role authenticated;create role service_role;create schema private;
create function private.is_dealer_publisher(u uuid) returns boolean language sql as $$select u='${dealer}'::uuid$$;
create table community_profiles(user_id uuid,visible boolean);
insert into community_profiles values('${dealer}',true);
create table games(id uuid,away_team text,home_team text,kickoff timestamptz);
insert into games values('${game}','Washington Commanders','New York Giants','2026-11-13T01:15:00Z');
create table community_posts(id uuid,user_id uuid,sport text,kind text,title text,body text,card text,legs jsonb,stake numeric);
insert into community_posts values('${post}','${dealer}','nfl','talk','Defense vs Position · test','Public stats only. Game ${game}','vq-publication:v1','[]',null);`);
await db.exec(fs.readFileSync('supabase/migrations/20261110233447_nfl_position_card_design.sql','utf8'));
const read=async()=>{await db.exec('set role anon');try{return (await db.query(`select public.nfl_position_card('${post}') r`)).rows[0].r;}finally{await db.exec('reset role');}};
assert.equal((await read()).game.home_team,'New York Giants');
for(const sql of [`update community_posts set user_id='${member}'`,`update community_posts set legs='["pick"]'`,`update community_posts set stake=1`,`update community_posts set title='Private message'`,`update community_profiles set visible=false`]){
 await db.exec('begin');await db.exec(sql);assert.equal(await read(),null,sql);await db.exec('rollback');
}
assert.equal((await db.query("select public.nfl_position_card('00000000-0000-4000-8000-000000000099') r")).rows[0].r,null);
console.log('NFL position card public projection checks passed');await db.close();
