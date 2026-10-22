import { z } from 'zod';
import { fetchSportradarCurrentWeek, fetchSportradarGame, sportradarConfig, SportradarError } from './sportradar-nfl';
import type { SupabaseClient } from '@supabase/supabase-js';
const gameSchema = z.object({id:z.string().uuid(),scheduled:z.string().datetime({offset:true}),status:z.string(),home:z.object({id:z.string().uuid(),alias:z.string()}),away:z.object({id:z.string().uuid(),alias:z.string()})});
export function scheduleGames(payload: Record<string,unknown>) {
 const s=z.object({week:z.object({games:z.array(gameSchema)})}).safeParse(payload);
 if(!s.success) throw new SportradarError('schedule_schema_unverified');
 return s.data.week.games;
}
export function collectionGames(payload: Record<string,unknown>, now=Date.now()) {
 return scheduleGames(payload).filter(g=> Date.parse(g.scheduled)-600000<=now && now<Date.parse(g.scheduled)+6*3600000 && !['canceled','cancelled','postponed'].includes(g.status)).sort((a,b)=>Date.parse(a.scheduled)-Date.parse(b.scheduled));
}
export async function collectSportradar(db: SupabaseClient) {
 const check=<T>(r:{data:T;error:unknown})=>{if(r.error)throw new SportradarError('storage_failed');return r.data;};
 const run=check(await db.rpc('claim_sportradar_run')) as string|null;
 if(!run)return {status:'already_checked'};
 const errors:string[]=[];let saved=0;let skipped=0;
 const reserve=async()=>{if(!check(await db.rpc('reserve_sportradar_call',{p_run:run})))throw new SportradarError('local_request_budget_reached');};
 const save=async(r:Awaited<ReturnType<typeof fetchSportradarCurrentWeek>>,feed:string,game_id:string|null)=>{
  check(await db.from('sportradar_snapshots').insert({run_id:run,game_id,feed,source_url:r.source_url,sha256:r.sha256,retrieved_at:r.retrieved_at,provider_last_modified:r.provider_last_modified,provider_date:r.provider_date,payload:r.payload,access:r.access}));saved++;
 };
 try {
  const config=sportradarConfig();
  const cached=check(await db.from('sportradar_snapshots').select('payload,retrieved_at').eq('feed','schedule').order('retrieved_at',{ascending:false}).limit(1).maybeSingle());
  let payload=cached?.payload as Record<string,unknown>|undefined;
  if(!cached || Date.parse(cached.retrieved_at)<Date.now()-12*3600000){await reserve();const r=await fetchSportradarCurrentWeek(config);scheduleGames(r.payload);await save(r,'schedule',null);payload=r.payload;}
  const candidates=collectionGames(payload!);
  // Least-recently checked first avoids starving later games when more than two overlap.
  const recent=check(await db.from('sportradar_snapshots').select('game_id,retrieved_at,payload').eq('feed','statistics').order('retrieved_at',{ascending:false}).limit(500));
  const last=new Map<string,{at:number;closed:boolean}>();
  for(const r of recent||[])if(r.game_id&&!last.has(r.game_id))last.set(r.game_id,{at:Date.parse(r.retrieved_at),closed:r.payload?.status==='closed'});
  const games=candidates.filter(g=>!last.get(g.id)?.closed).sort((a,b)=>(last.get(a.id)?.at||0)-(last.get(b.id)?.at||0));
  skipped=Math.max(0,games.length-2);
  for(const game of games.slice(0,2))for(const feed of ['statistics','pbp'] as const){
   try{
    await reserve();const r=await fetchSportradarGame(config,game.id,feed);
    const p=r.payload as {summary?:{home?:{id?:string};away?:{id?:string}}};
    if(p.summary?.home?.id!==game.home.id || p.summary?.away?.id!==game.away.id)throw new SportradarError('provider_team_identity_unverified');
    await save(r,feed,game.id);
   }catch(e){errors.push(`${game.id}/${feed}: ${e instanceof SportradarError?e.code:'collection_failed'}`);}
  }
 }catch(e){errors.push(e instanceof SportradarError?e.code:'collection_failed');}
 const status=errors.length?'partial':saved?'collected':'waiting_for_game_window';
 const detail={saved,skipped,errors,live_freshness_verified:false};
 check(await db.from('sportradar_runs').update({status,finished_at:new Date().toISOString(),detail}).eq('id',run));
 return {run_id:run,status,...detail};
}
