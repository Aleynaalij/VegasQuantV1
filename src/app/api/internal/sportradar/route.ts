import { timingSafeEqual } from 'node:crypto';
import { serviceDb } from '@/lib/billing-server';
import { collectSportradar } from '@/lib/sportradar-auto';
export const dynamic='force-dynamic';
export const maxDuration=120;
export async function POST(req:Request){
 const expected=process.env.SPORTRADAR_COLLECTOR_SECRET;
 const actual=req.headers.get('authorization')||'';
 const token=expected?`Bearer ${expected}`:'';
 if(!token || Buffer.byteLength(actual)!==Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(actual),Buffer.from(token)))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await collectSportradar(serviceDb()),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'collector_storage_failed'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
