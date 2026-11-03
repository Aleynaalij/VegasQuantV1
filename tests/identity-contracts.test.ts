import test from 'node:test';
import assert from 'node:assert/strict';
import {gameForEvent,priceObservations} from '../supabase/functions/nba-sync/normalize';
import {resultPayload} from '../supabase/functions/nba-results/parse';
import {contractFor,espnStat} from '../supabase/functions/result-sync/grade';
const tip='2026-11-03T23:00:00Z';
const fixture={id:'g1',provider_id:'123',home_team:'Boston Celtics',away_team:'Los Angeles Clippers',tipoff:tip};
const event={id:'event1',home_team:fixture.home_team,away_team:fixture.away_team,commence_time:tip,bookmakers:[]};
test('NBA odds binding requires one unique candidate regardless of input order',()=>{
 assert.equal(gameForEvent(event,[fixture])?.id,'g1');
 for(const games of [[fixture,{...fixture,id:'g2'}],[{...fixture,id:'g2'},fixture]]) {
  assert.equal(gameForEvent(event,games),undefined);
  assert.deepEqual(priceObservations([event],games,'odds',['h2h'],Date.parse(tip)-60000),[]);
 }
});
test('NBA summary with an explicit foreign provider ID is rejected before status handling',()=>{
 for(const completed of [true,false]){
 const summary={header:{id:'456',competitions:[{status:{type:{completed,name:completed?'STATUS_FINAL':'STATUS_SCHEDULED'}}}]}};
 assert.equal(typeof resultPayload(summary as never,fixture,'a'.repeat(64)),'string');
 }
});
const game={id:'nfl',provider_id:'99',home_team:'Los Angeles Chargers',away_team:'Los Angeles Rams',home_abbreviation:'LAC',away_abbreviation:'LAR',kickoff:tip,season:2026,week:9};
const selection={game_id:'nfl',name:'Synthetic Runner',team:'Los Angeles',market:'Full game · Over 20.5 rushing yards'};
test('a shared city alias cannot silently select one NFL side',()=>{
 assert.equal(typeof contractFor(selection,'leg',[game],'2026-11-03T20:00:00Z','2026-11-04T02:00:00Z'),'string');
 assert.equal(typeof contractFor({...selection,team:'LAC'},'leg',[game],'2026-11-03T20:00:00Z','2026-11-04T02:00:00Z'),'object');
});
test('duplicate matching NFL player identities remain ambiguous when one statistic is missing',()=>{
 const c={leg_key:'leg',game_id:'nfl',player:'Synthetic Runner',team:game.away_team,metric:'rushing_yards',threshold:20.5,operator:'over',period:'full_game',market:selection.market} as const;
 const athlete=(id:string,stats:string[])=>({athlete:{id,displayName:'Synthetic Runner'},stats});
 const summary={header:{id:'99',season:{year:2026,type:2},competitions:[{date:tip,status:{type:{completed:true,state:'post'}},competitors:[{homeAway:'home',team:{displayName:game.home_team}},{homeAway:'away',team:{displayName:game.away_team}}]}]},boxscore:{players:[{team:{displayName:game.away_team},statistics:[{name:'rushing',keys:['rushingYards'],athletes:[athlete('1',['30']),athlete('2',[])]}]}]}};
 assert.equal(typeof espnStat(summary,game,c),'string');
 summary.boxscore.players[0].statistics[0].athletes.pop();
 assert.equal((espnStat(summary,game,c) as {value:number}).value,30);
});
