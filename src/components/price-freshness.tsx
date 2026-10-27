"use client";
import {useEffect,useState} from 'react';
import {priceFreshness} from '@/lib/price-freshness';
export default function PriceFreshness({at}:{at?:string|null}) {
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t)},[]);
 const s=priceFreshness(at,now ?? 0);
 return <p className={`price-freshness ${s.state}`}><strong>{s.label}</strong>{at && Number.isFinite(Date.parse(at)) && <> · <time dateTime={at}>{new Date(at).toLocaleString('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} ET</time></>}<small>Snapshot age only; confirm the executable price at your sportsbook.</small></p>;
}
