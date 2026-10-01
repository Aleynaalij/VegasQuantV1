import {createClient} from '@supabase/supabase-js';
import {fixturesFromScoreboard,observationsFromScoreboard,oddsObservations} from './normalize.ts';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const sha=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function json(url:string){const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'VegasQuant/1.0 (sports research; vegasquant.app)'}});if(!r.ok)throw Error(`Provider returned ${r.status}`);return r.json();}
Deno.serve(async(req:Request)=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=req.headers.get('authorization')?.replace(/^Bearer /,'');
 if(!token)return new Response('Unauthorized',{status:401});
 const auth=await db.rpc('feed_authorize',{p_digest:await sha(token)});
 if(auth.error||auth.data!==true)return new Response('Unauthorized',{status:401});
 try {
  const body=await req.json().catch(()=>({}));
  const seed=await json('https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
  const year=Number(seed.leagues?.[0]?.season?.year),week=Number(seed.week?.number||seed.events?.[0]?.week?.number||1),seasonType=Number(seed.leagues?.[0]?.season?.type?.type||2);
  if(!Number.isInteger(year)||year<2026||year>2030)throw Error('Unexpected season');
  const weeks=body.bootstrap?Array.from({length:18},(_,i)=>i+1):[week,Math.min(week+1,seasonType===2?18:5)];
  let added=0;
  for(let i=0;i<weeks.length;i+=3){
   const batch=await Promise.all(weeks.slice(i,i+3).map(w=>json(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${year}&seasontype=${body.bootstrap?2:seasonType}&week=${w}&limit=1000`)));
   for(const data of batch){const games=fixturesFromScoreboard(data);const observations=observationsFromScoreboard(data);for(const o of observations)o.fingerprint=await sha(JSON.stringify([o.provider_id,o.kind,o.payload]));
    const r=await db.rpc('ingest_source',{p:{provider:'ESPN',games,observations,details:{games:games.length,mode:body.bootstrap?'season import':'scheduled refresh'}}});if(r.error)throw r.error;added+=r.data.inserted;}
  }
  const key=Deno.env.get('ODDS_API_KEY');
  if(key&&Deno.env.get('ODDS_FEED_ENABLED')==='true'){
   const events=await json(`https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${encodeURIComponent(key)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`);
   const {data:games,error}=await db.from('games').select('id,away_team,home_team,kickoff');if(error)throw error;
   const observations=oddsObservations(events,games||[]);for(const o of observations)o.fingerprint=await sha(JSON.stringify([o.game_id,o.kind,o.payload]));
   const r=await db.rpc('ingest_source',{p:{provider:'The Odds API',observations}});if(r.error)throw r.error;
  }
  return Response.json({ok:true,added,odds_configured:Boolean(key&&Deno.env.get('ODDS_FEED_ENABLED')==='true')});
 }catch(e){const message=e instanceof Error?e.message:'Provider ingestion failed';await db.rpc('ingest_source',{p:{provider:'source-sync',status:'error',details:{message:message.slice(0,200)}}});return Response.json({error:'Source refresh failed; previous snapshots retained'},{status:502});}
});
