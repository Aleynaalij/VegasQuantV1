import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceFreshness} from '../src/lib/price-freshness';
test('missing, malformed and future quote observations never claim freshness',()=>{const now=Date.parse('2026-10-11T16:00:00Z');for(const at of [null,'garbage','2026-10-11T16:01:00Z'])assert.equal(priceFreshness(at,now).state,'unknown')});
test('freshness ages independently of publication time at 30 minutes',()=>{const now=Date.parse('2026-10-11T16:00:00Z');assert.equal(priceFreshness('2026-10-11T15:31:00Z',now).state,'recent');assert.equal(priceFreshness('2026-10-11T15:30:00Z',now).state,'stale');assert.match(priceFreshness('2026-10-09T16:00:00Z',now).label,/2d old/)});

test('invalid clocks and empty timestamps never claim a recent quote',()=>{
 const at='2026-11-02T16:00:00Z';
 for(const now of [NaN,Infinity,-Infinity]) assert.equal(priceFreshness(at,now).state,'unknown');
 for(const value of ['',undefined,null]) assert.equal(priceFreshness(value,Date.parse(at)).state,'unknown');
});
test('quote boundary transitions are exact and future values are unknown',()=>{
 const now=Date.parse('2026-11-02T16:00:00Z');
 assert.equal(priceFreshness(new Date(now-1800000+1).toISOString(),now).state,'recent');
 assert.equal(priceFreshness(new Date(now-1800000).toISOString(),now).state,'stale');
 assert.equal(priceFreshness(new Date(now+1).toISOString(),now).state,'unknown');
 assert.equal(priceFreshness(new Date(now).toISOString(),now).state,'recent');
});
