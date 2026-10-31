import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite();
// The live constraints these replace (community_social_feed, contributor_records, nba preparation rule).
await db.exec(`create table public.community_posts(id serial primary key,sport text not null constraint community_posts_sport_check check(sport in ('nfl','nba')),kind text not null,constraint nba_preparation_posts check(sport<>'nba' or kind='talk'));
create table public.ruby_submissions(id serial primary key,sport text not null constraint ruby_submissions_sport_check check(sport in ('Soccer','NFL','NHL','NBA','Baseball','WNBA')));
create table public.ruby_card_revisions(id serial primary key,sport text not null constraint ruby_card_revisions_sport_check check(sport in ('Soccer','NFL','NHL','NBA','Baseball','WNBA')));
insert into public.community_posts(sport,kind) values('nfl','slip'),('nba','talk');insert into public.ruby_submissions(sport) values('NFL'),('NHL');`);
await db.exec(fs.readFileSync('supabase/migrations/20261031160000_zone_all_sports.sql','utf8'));
for (const [sport,kind] of [['nhl','talk'],['ncaab','talk'],['nba','slip'],['nba','result']]) await db.query('insert into public.community_posts(sport,kind) values($1,$2)',[sport,kind]);
await assert.rejects(db.query(`insert into public.community_posts(sport,kind) values('mlb','talk')`));
await assert.rejects(db.query(`insert into public.community_posts(sport,kind) values('NHL','talk')`));
await db.query(`insert into public.ruby_submissions(sport) values('NCAAB')`);await db.query(`insert into public.ruby_card_revisions(sport) values('NCAAB')`);
await assert.rejects(db.query(`insert into public.ruby_submissions(sport) values('ncaab')`));
assert.equal((await db.query('select count(*)::int n from public.community_posts')).rows[0].n,6);
assert.equal((await db.query('select count(*)::int n from public.ruby_submissions')).rows[0].n,3);
console.log('PASS Zone accepts nfl/nba/nhl/ncaab posts (NBA any kind) and NCAAB lays; existing rows kept; unknown sports rejected');
await db.close();
