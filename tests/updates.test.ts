import test from 'node:test';
import assert from 'node:assert/strict';
import {deskUpdates} from '../src/lib/updates';
import {emptyDesk,type Analysis,type Market} from '../src/lib/domain';
test('feed identifies changed and removed sections while retaining historical records',()=>{
 const first:Analysis={id:'a1',game_id:'g',version:1,title:'Initial',sections:{Injuries:'Pending',Weather:'Clear'},projections:{true_total:'37'},raw_handoff:'raw1',source:'Owner',created_at:'2026-09-30T10:00:00Z'};
 const next:Analysis={...first,id:'a2',version:2,title:'Update',sections:{Injuries:'OUT'},projections:{true_total:'38'},raw_handoff:'raw2',created_at:'2026-09-30T11:00:00Z'};
 const d={...emptyDesk,analyses:[next,first]};
 const u=deskUpdates(d,'g');assert.equal(u[0].id,'a2');assert.deepEqual(u[0].changes,['Injuries','Weather']);assert.match(u[0].summary,/1 projection fields changed/);assert.equal(first.sections.Injuries,'Pending');assert.equal(d.analyses.length,2);
});
test('market updates preserve observed prices without inventing missing numbers',()=>{
 const m:Market={id:'m1',game_id:'g',observed_at:'2026-09-30T09:00:00Z',created_at:'2026-09-30T10:00:00Z',source:'Owner',spread:null,moneyline:null,total:'40.5',kind:'opening',notes:null};
 const u=deskUpdates({...emptyDesk,markets:[{...m,id:'m2',total:'38.5',kind:'current',observed_at:'2026-09-30T11:00:00Z',created_at:'2026-09-30T11:00:00Z'},m]},'g');assert.deepEqual(u[0].changes,['Total: 40.5 → 38.5']);assert.equal(deskUpdates({...emptyDesk,markets:[m]},'other').length,0);
});
