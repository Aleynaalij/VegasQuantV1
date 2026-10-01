'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {time} from '@/lib/domain';
import {SourceLink} from './ui';
type Observation={id:string;kind:string;provider:string;source:string;observed_at:string|null;recorded_at:string;payload:Record<string,unknown>};
export default function SourceObservations({gameId}:{gameId:string}){
 const [rows,setRows]=useState<Observation[]>([]),[error,setError]=useState('');
 useEffect(()=>{let live=true;async function load(){const r=await supabase.from('source_observations').select('*').eq('game_id',gameId).order('recorded_at',{ascending:false}).limit(30);if(live){setError(r.error?'Source updates are temporarily unavailable':'');setRows(r.data||[]);}}void load();const t=setInterval(load,60000);return()=>{live=false;clearInterval(t)};},[gameId]);
 return <details className="mi-section"><summary>Source updates · automated facts</summary><p className="muted">Provider observations, separate from Vegas Quant analysis. Scores do not automatically grade wagers. Odds are recorded quotes, not guaranteed current availability.</p>{error&&<p role="alert">{error}</p>}{!rows.length&&<p>No source updates received yet.</p>}{rows.map(r=><article className="mi-item" key={r.id}><strong>{r.kind.toUpperCase()} · {r.provider}</strong><p>{r.observed_at?`Provider timestamp: ${time(r.observed_at)}`:'Provider observation time not supplied'}<br/>Retrieved {time(r.recorded_at)}</p><SourceLink href={r.source}>Source</SourceLink><details><summary>View supplied data</summary><pre className="mi-preview">{JSON.stringify(r.payload,null,2)}</pre></details></article>)}</details>;
}
