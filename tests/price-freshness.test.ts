import {test} from 'node:test';
import assert from 'node:assert/strict';
import {priceFreshness} from '../src/lib/price-freshness';
test('missing, malformed and future quote observations never claim freshness',()=>{const now=Date.parse('2026-10-11T16:00:00Z');for(const at of [null,'garbage','2026-10-11T16:01:00Z'])assert.equal(priceFreshness(at,now).state,'unknown')});
test('freshness ages independently of publication time at 30 minutes',()=>{const now=Date.parse('2026-10-11T16:00:00Z');assert.equal(priceFreshness('2026-10-11T15:31:00Z',now).state,'recent');assert.equal(priceFreshness('2026-10-11T15:30:00Z',now).state,'stale');assert.match(priceFreshness('2026-10-09T16:00:00Z',now).label,/2d old/)});
