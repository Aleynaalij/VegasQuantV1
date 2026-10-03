"use client";
import Link from "next/link";
import { useState } from "react";
import { time } from "@/lib/domain";
import BrandMark from "./brand-mark";
import EdgeMarketInfo from "./edge-market-info";
export type EdgeItem = {market_info_url?:string|null;selection:string;number?:string;odds:number;edge:number;model_probability:number;market_probability:number;confidence:number;why_like:string;why_lose:string;playable_number:string;pass_number:string;slug:string;matchup:string;kickoff:string;source_at:string;role:string};
export type EdgeRelease = {official_pick_id:string;created_at:string;items:EdgeItem[]};
export default function EdgeReleaseCard({release}:{release:EdgeRelease}) {
 const [copied,setCopied]=useState("");
 return <section className="edge-release" aria-label="Published edge picks">
  <div className="edge-release-heading"><BrandMark/><span>VEGAS QUANT · EDGE PICKS</span><b>3%+</b></div>
  <h2>The edge list.</h2><p>One challenge pick. Up to two more qualifying reads.</p>
  <time dateTime={release.created_at}>Published {time(release.created_at)}</time>
  <div className="edge-pick-list">{release.items.map((p,i)=>{
   const started=Date.parse(p.kickoff)<=Date.now();
   return <article className="edge-pick" key={`${p.slug}-${p.selection}`}>
    <div className="edge-pick-top"><span>{String(i+1).padStart(2,'0')} · {p.role}</span><strong>+{p.edge} pp</strong></div>
    <small>{p.matchup}{started?' · Game started / archived':''}</small><h3>{p.selection}</h3>
    <div className="edge-pick-metrics"><b>{p.odds>0?'+':''}{p.odds}</b><span>Confidence {p.confidence}/10</span></div>
    {p.number&&<p className="edge-number">Published number: {p.number}</p>}
    <p className="edge-read">{p.why_like}</p>
    <details><summary>Price limits & risk</summary><p>Playable: {p.playable_number||'Not supplied'}</p><p>Pass: {p.pass_number||'Not supplied'}</p><p>{p.why_lose}</p><p>Analyst probability {p.model_probability}% · Market implied {p.market_probability}%</p><p>Source snapshot {time(p.source_at)}</p></details>
    <div className="edge-pick-actions"><Link href={i===0?'/':`/matchups/${p.slug}`}>{i===0?'View challenge slip':'Matchup research'} →</Link><button className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(`${p.selection}${p.number?` | Number: ${p.number}`:''} | ${p.odds>0?'+':''}${p.odds} | Published ${time(release.created_at)}`);setCopied(p.selection);}catch{setCopied('Copy unavailable. Select the pick text.');}}}>Copy pick</button></div>
    <div className="edge-pick-actions"><EdgeMarketInfo url={p.market_info_url} /></div>
   </article>;
  })}</div>
  <p className="edge-copy-status" role="status">{copied?(copied.startsWith('Copy unavailable')?copied:'Pick copied.'):''}</p>
  <details className="edge-explainer" open><summary>What does 3% edge mean?</summary><p>Our analyst estimates a win probability at least 3 percentage points above the market’s implied probability at the published price. Example: 56% estimated versus 53% implied = +3 pp edge.</p><p>It is an estimate, not a guaranteed win or a 3% return. A different price can reduce or erase the edge.</p><p>These are individual selections. If you combine them in a parlay, all legs must win (subject to sportsbook rules). Their edges do not add together, and correlated legs need separate analysis. No parlay edge is claimed here.</p></details>
  <p className="edge-footnote">Only qualified, analyst-approved picks appear. No filler to reach three. Published prices stay locked; availability may change. Additional edges do not change your challenge bankroll.</p>
 </section>;
}
