import {createClient} from '@supabase/supabase-js';
import {LIVE_MARKETS,liveEvents,liveObservations} from './select.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const reply=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return reply({error:'POST required'},405);
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)return reply({error:'Unauthorized'},401);
 const auth=await db.rpc('feed_authorize',{p_digest:await sha(token)});
 if(auth.error||auth.data!==true)return reply({error:'Unauthorized'},401);
 const key=Deno.env.get('ODDS_API_KEY');
 if(!key||Deno.env.get('ODDS_FEED_ENABLED')!=='true'||Deno.env.get('ODDS_PROPS_ENABLED')!=='true')return reply({error:'Live props not configured'},409);
 const now=Date.now();
 const games=await db.from('games').select('id,home_team,away_team,kickoff').eq('sport','nfl').gte('kickoff',new Date(now-6*3600000).toISOString()).lte('kickoff',new Date(now).toISOString());
 if(games.error)return reply({error:'Game lookup failed'},503);
 const claimed=await db.rpc('claim_nfl_live_props_run');
 if(claimed.error)return reply({error:'Collector journal unavailable'},503);
 if(!claimed.data)return reply({status:'recent_run_or_budget_limit'});
 const run=claimed.data;let credits=0;let unknownCost=false;let inserted=0;let stale=0;let remaining:number|null=null;const errors:string[]=[];const attempted:string[]=[];let deferred=0;
 const json=async(path:string)=>{
  let r:Response;
  try{r=await fetch(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/${path}${path.includes('?')?'&':'?'}apiKey=${encodeURIComponent(key)}`,{signal:AbortSignal.timeout(15000),redirect:'error',cache:'no-store'});}catch{unknownCost=true;throw Error('provider_unreachable');}
  const c=r.headers.get('x-requests-last'),left=r.headers.get('x-requests-remaining');
  if(c!==null&&Number.isFinite(Number(c)))credits+=Math.max(0,Number(c));else if(path!=='events')unknownCost=true;
  if(left!==null&&Number.isFinite(Number(left)))remaining=Number(left);
  if(!r.ok){await r.body?.cancel();throw Error(`provider_http_${r.status}`);}
  const raw=await r.text();let data:unknown;try{data=JSON.parse(raw);}catch{throw Error('provider_schema_unverified');}return {data:data as any,received_at:new Date().toISOString(),sha256:await sha(raw)};
 };
 let eligible=0;
 try{
  if(games.data?.length){
   const listing=await json('events');if(!Array.isArray(listing.data))throw Error('provider_schema_unverified');
   const events=liveEvents(listing.data,games.data,now);eligible=events.length;
   const recent=await db.from('feed_runs').select('created_at,details').eq('provider','The Odds API live props').order('created_at',{ascending:false}).limit(50);
   if(recent.error)throw Error('rotation_history_unavailable');
   const last=new Map<string,number>();for(const r of recent.data||[])for(const id of r.details?.attempted_event_ids||[])if(!last.has(id))last.set(id,Date.parse(r.created_at));
   events.sort((a,b)=>(last.get(a.id)||0)-(last.get(b.id)||0));deferred=Math.max(0,events.length-2);
   for(const event of events.slice(0,2)){
    attempted.push(event.id);
    try{
     if(remaining===null||remaining<100)throw Error('provider_quota_unknown_or_low');
     const r=await json(`events/${event.id}/odds?markets=${LIVE_MARKETS.join(',')}&bookmakers=fanduel&oddsFormat=american`);
     if(r.data.id!==event.id||r.data.home_team!==event.home_team||r.data.away_team!==event.away_team||r.data.commence_time!==event.commence_time)throw Error('provider_event_identity_unverified');
     const observations=liveObservations(r.data,games.data,Date.parse(r.received_at));
     if(!observations.length)stale++;
     const sourceHash=r.sha256;
     for(const o of observations){o.payload={...o.payload,provider_response_hash:sourceHash} as typeof o.payload;o.fingerprint=await sha(JSON.stringify([o.game_id,o.kind,o.observed_at,o.payload]));}
     const saved=await db.rpc('ingest_source',{p:{provider:'The Odds API live props',observations}});
     if(saved.error)throw Error('quote_storage_failed');inserted+=saved.data?.inserted||0;
    }catch(e){errors.push(`${event.id}: ${e instanceof Error?e.message:'live_quote_failed'}`);}
   }
  }
 }catch(e){errors.push(e instanceof Error?e.message:'live_quote_failed');}
 const status=errors.length||stale||deferred?'partial':eligible?'ok':'no live events';
 const details={fetched_at:new Date().toISOString(),reserved_credits:unknownCost?Math.max(12,credits):credits,provider_credits_remaining:remaining,attempted_event_ids:attempted,eligible_events:eligible,deferred_events:deferred,inserted_quotes:inserted,missing_or_stale_fanduel_events:stale,errors,book:'FanDuel',markets:LIVE_MARKETS,quote_max_age_seconds:120,scope:'Private research quotes received after kickoff; full-game markets, not second-half-only; no executable price or combined parlay quote guaranteed'};
 const finished=await db.from('feed_runs').update({status,details}).eq('id',run);
 if(finished.error)return reply({error:'Collector completion not stored'},503);
 return reply({status,...details});
});
