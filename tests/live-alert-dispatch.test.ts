import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchLiveAlerts} from '../src/lib/live-alert-dispatch';
import type {AlertCandidate, PlannedAlert} from '../src/lib/live-alerts';
const alert=(pick:string):PlannedAlert=>({sport:'nhl',pick,message:'Synthetic cleared',link:'/nhl/games/synthetic'});
const defaults=()=>({candidates:async()=>[] as AlertCandidate[],plan:async()=>[] as PlannedAlert[],publish:async(_a:PlannedAlert)=>{},retryZone:async()=>({attempted:0,posted:0,failed:0}),zoneHealth:async()=>({pending:0,due:0,blocked:0})});
test('empty candidate lane still repairs Zone work',async()=>{
 let retried=0;const r=await dispatchLiveAlerts({...defaults(),retryZone:async()=>{retried++;return {attempted:1,posted:1,failed:0};}});
 assert.equal(retried,1);assert.equal(r.ok,true);assert.equal(r.sent,0);assert.equal(r.zone.retry?.posted,1);
});
for(const lane of ['candidates','plan'] as const)test(`${lane} outage does not strand pending Zone work`,async()=>{
 let retried=false;const r=await dispatchLiveAlerts({...defaults(),[lane]:async()=>{throw Error('outage');},retryZone:async()=>{retried=true;return {attempted:1,posted:1,failed:0};}});
 assert.equal(retried,true);assert.equal(r.live_unavailable,true);assert.equal(r.ok,false);
});
test('retry failure does not stop fresh alerts and individual publish failure does not stop later picks',async()=>{
 const published:string[]=[];const r=await dispatchLiveAlerts({...defaults(),plan:async()=>[alert('bad'),alert('good')],retryZone:async()=>{throw Error('retry unavailable');},publish:async(a)=>{published.push(a.pick);if(a.pick==='bad')throw Error('publish failed');}});
 assert.deepEqual(published,['bad','good']);assert.equal(r.sent,1);assert.equal(r.failed,1);assert.equal(r.decided,2);assert.equal(r.zone_unavailable,true);assert.equal(r.ok,false);
});
test('retry and live lanes start independently; final health waits for both and includes fresh failures',async()=>{
 let release!:()=>void;const blocked=new Promise<void>(r=>{release=r;});const events:string[]=[];
 const pending=dispatchLiveAlerts({...defaults(),retryZone:async()=>{events.push('retry-start');await blocked;events.push('retry-done');return {attempted:1,posted:1,failed:0};},plan:async()=>[alert('fresh')],publish:async()=>{events.push('publish');release();},zoneHealth:async()=>{events.push('health');return {pending:1,due:0,blocked:0};}});
 const r=await pending;assert.ok(events.indexOf('publish')<events.indexOf('retry-done'));assert.equal(events.at(-1),'health');assert.equal(r.sent,1);assert.equal(r.zone.health?.pending,1);assert.equal(r.ok,false);
});
for(const kind of ['pending','blocked'] as const)test(`${kind} result work surfaces an incomplete outcome`,async()=>{
 const r=await dispatchLiveAlerts({...defaults(),zoneHealth:async()=>({pending:0,due:0,blocked:0,[kind]:1})});assert.equal(r.ok,false);assert.equal(r.zone.health?.[kind],1);
});
test('health lookup failure is visible even when live alerts succeeded',async()=>{
 const r=await dispatchLiveAlerts({...defaults(),plan:async()=>[alert('fresh')],zoneHealth:async()=>{throw Error('health outage');}});assert.equal(r.sent,1);assert.equal(r.ok,false);assert.equal(r.zone_unavailable,true);assert.equal(r.zone.health,null);
});
test('fresh drain failure preserves accepted count and is visible after successful backlog repair',async()=>{
 let drains=0;const r=await dispatchLiveAlerts({...defaults(),plan:async()=>[alert('accepted')],retryZone:async()=>{if(++drains===2)throw Error('fresh drain timeout');return {attempted:2,posted:2,failed:0};},zoneHealth:async()=>({pending:1,due:1,blocked:0})});
 assert.equal(drains,2);assert.equal(r.sent,1);assert.equal(r.failed,0);assert.equal(r.zone.retry?.posted,2);assert.equal(r.zone.fresh,null);assert.equal(r.zone_unavailable,true);assert.equal(r.ok,false);
});
test('fresh drain starts only after backlog and acceptance complete; health follows both drains',async()=>{
 let release!:()=>void;const backlogWait=new Promise<void>(r=>{release=r;});let drains=0,active=0;const events:string[]=[];
 const r=await dispatchLiveAlerts({...defaults(),plan:async()=>[alert('accepted')],publish:async()=>{events.push('accepted');release();},retryZone:async()=>{
  const n=++drains;assert.equal(active,0,'drains never overlap');active++;events.push(`drain${n}-start`);
  if(n===1)await backlogWait;else assert.ok(events.includes('accepted'));
  events.push(`drain${n}-end`);active--;return {attempted:1,posted:1,failed:0};
 },zoneHealth:async()=>{events.push('health');return {pending:0,due:0,blocked:0};}});
 assert.equal(drains,2);assert.ok(events.indexOf('drain1-end')<events.indexOf('drain2-start'));assert.equal(events.at(-1),'health');assert.equal(r.zone.fresh?.posted,1);assert.equal(r.ok,true);
});
test('no accepted alerts means only backlog drain, even when every publication fails',async()=>{
 let drains=0;const r=await dispatchLiveAlerts({...defaults(),plan:async()=>[alert('failed')],publish:async()=>{throw Error('accept failed');},retryZone:async()=>{drains++;return {attempted:0,posted:0,failed:0};}});
 assert.equal(drains,1);assert.equal(r.sent,0);assert.equal(r.failed,1);assert.equal(r.zone.fresh,null);
});
