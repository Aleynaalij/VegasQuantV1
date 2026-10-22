import test from 'node:test';import assert from 'node:assert/strict';
import {liveEvents,liveObservations} from '../supabase/functions/nfl-live-props/select';
const now=Date.parse('2026-10-23T01:45:00Z');const kickoff='2026-10-23T00:15:00Z';
const game={id:'game',home_team:'Chicago Bears',away_team:'New England Patriots',kickoff};
const event={id:'abc123',home_team:game.home_team,away_team:game.away_team,commence_time:kickoff};
const market={key:'player_rush_yds',last_update:new Date(now-30000).toISOString(),outcomes:[{name:'Over',description:'Player',point:40.5,price:-110}]};
const quote={...event,bookmakers:[{key:'fanduel',title:'FanDuel',last_update:new Date(now).toISOString(),markets:[market]}]};
test('live collection requires a unique current game and never pulls future or old games',()=>{
 assert.equal(liveEvents([event,event],[game],now).length,1);assert.equal(liveEvents([event],[game],Date.parse(kickoff)-1).length,0);assert.equal(liveEvents([event],[game],Date.parse(kickoff)+6*3600000).length,0);assert.equal(liveEvents([event],[game,game],now).length,0);
});
test('live FanDuel observations reject stale, pregame, missing market time and other books',()=>{
 const good=liveObservations(quote,[game],now);assert.equal(good.length,1);assert.equal(good[0].payload.quote_phase,'in_play');assert.equal(good[0].payload.period,'full_game');
 for(const stamp of [new Date(now-120001).toISOString(),kickoff.replace('00:15','00:14'),new Date(now+1).toISOString(),undefined])assert.equal(liveObservations({...quote,bookmakers:[{...quote.bookmakers[0],markets:[{...market,last_update:stamp}]}]},[game],now).length,0);
 assert.equal(liveObservations({...quote,bookmakers:[{...quote.bookmakers[0],key:'draftkings',title:'DraftKings'}]},[game],now).length,0);
});
