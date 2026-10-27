import { propObservations } from '../source-sync/props.ts';
export const LIVE_MARKETS=['player_rush_yds','player_reception_yds','player_pass_yds','player_receptions','player_rush_yds_alternate','player_reception_yds_alternate'];
type Game={id:string;home_team:string;away_team:string;kickoff:string};
type Event={id:string;home_team:string;away_team:string;commence_time:string};
export function liveEvents(events:Event[],games:Game[],now:number){
 return [...new Map(events.filter(e=>/^[a-zA-Z0-9_-]+$/.test(e.id)&&Date.parse(e.commence_time)<=now&&Date.parse(e.commence_time)>now-6*3600000&&games.filter(g=>g.home_team===e.home_team&&g.away_team===e.away_team&&Math.abs(Date.parse(g.kickoff)-Date.parse(e.commence_time))<60000).length===1).map(e=>[e.id,e])).values()];
}
export function liveObservations(event:Parameters<typeof propObservations>[0],games:Game[],now:number){
 if(!liveEvents([event],games,now).length)return [];
 const filtered={...event,bookmakers:(event.bookmakers||[]).filter(b=>b.key==='fanduel'&&b.title==='FanDuel').map(b=>({...b,markets:b.markets.filter(m=>LIVE_MARKETS.includes(m.key)&&!!m.last_update&&Date.parse(m.last_update)>=Date.parse(event.commence_time)&&Date.parse(m.last_update)<=now&&Date.parse(m.last_update)>=now-120000)}))};
 return propObservations(filtered,games,now).map(o=>({...o,payload:{...o.payload,quote_phase:'in_play',period:'full_game',retrieved_at:new Date(now).toISOString(),live_executability_verified:false}}));
}
