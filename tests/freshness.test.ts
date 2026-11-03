import {test} from 'node:test';
import assert from 'node:assert/strict';
import {freshness} from '../src/lib/freshness';
const now=Date.parse('2026-11-02T16:00:00Z');
const at=(age:number)=>new Date(now-age).toISOString();
test('missing and invalid timestamps or clocks never invent an age',()=>{
 for(const value of [null,undefined,'','bad']) assert.equal(freshness(value,now).minutes,null);
 for(const clock of [NaN,Infinity,-Infinity]) assert.equal(freshness(at(0),clock).minutes,null);
});
test('relative-age transitions and six-hour warning use unchanged policy',()=>{
 for(const [age,label] of [[0,'0m ago'],[59999,'0m ago'],[60000,'1m ago'],[3599999,'59m ago'],[3600000,'1h ago'],[86400000,'1d ago']] as const)
  assert.equal(freshness(at(age),now).label,label);
 assert.equal(freshness(at(360*60000-1),now).tone,'muted');
 assert.equal(freshness(at(360*60000),now).tone,'gold');
});
test('future clock tolerance ends strictly after five minutes',()=>{
 assert.equal(freshness(at(-300000),now).label,'0m ago');
 assert.equal(freshness(at(-300001),now).label,'Timestamp needs review');
});
