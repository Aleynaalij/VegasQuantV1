import test from 'node:test';
import assert from 'node:assert/strict';
import {latestQuotes,NBA_QUOTE_MAX_AGE_MS,quoteTime,type NbaQuoteRow} from '../src/lib/nba-slate';
import {bookQuotes,BEST_MAX_AGE_MS,type QuoteRow} from '../src/lib/best-price';
const now=Date.parse('2026-11-03T12:00:00Z');
const row=(age=0):NbaQuoteRow=>({game_id:'synthetic',kind:'odds',observed_at:new Date(now-age).toISOString(),recorded_at:new Date(now).toISOString(),payload:{book:'FanDuel',market:'h2h',outcomes:[{name:'Synthetic Team',price:-110}]}});
test('nonfinite selector clocks never present current or best quotes',()=>{
 for(const clock of [NaN,Infinity,-Infinity]) {
  assert.deepEqual(latestQuotes([row()],clock),{});
  assert.equal(bookQuotes([row()],clock,BEST_MAX_AGE_MS).size,0);
 }
});
test('NBA eight-hour and five-minute tolerance boundaries retain existing policy',()=>{
 assert.equal(Object.keys(latestQuotes([row(NBA_QUOTE_MAX_AGE_MS)],now)).length,1);
 assert.deepEqual(latestQuotes([row(NBA_QUOTE_MAX_AGE_MS+1)],now),{});
 assert.equal(Object.keys(latestQuotes([row(-300000)],now)).length,1);
 assert.deepEqual(latestQuotes([row(-300001)],now),{});
});
test('best-price exact age and clock-skew boundaries preserve existing policy',()=>{
 assert.equal(bookQuotes([row(BEST_MAX_AGE_MS)],now,BEST_MAX_AGE_MS).size,1);
 assert.equal(bookQuotes([row(BEST_MAX_AGE_MS+1)],now,BEST_MAX_AGE_MS).size,0);
 assert.equal(bookQuotes([row(-300000)],now,BEST_MAX_AGE_MS).size,1);
 assert.equal(bookQuotes([row(-300001)],now,BEST_MAX_AGE_MS).size,0);
 for(const max of [NaN,Infinity,-Infinity,-1]) assert.equal(bookQuotes([row()],now,max).size,0);
});
test('retrieval time cannot freshen an old source timestamp; missing times stay empty',()=>{
 const stale=row(NBA_QUOTE_MAX_AGE_MS+1);
 assert.deepEqual(latestQuotes([stale],now),{});
 const missing={...row(),observed_at:null};
 assert.equal(quoteTime(missing),null);
 assert.deepEqual(latestQuotes([missing],now),{});
 assert.equal(bookQuotes([missing],now,BEST_MAX_AGE_MS).size,0);
 const fallback={...missing,payload:{...missing.payload!,provider_updated_at:new Date(now).toISOString()}};
 assert.equal(quoteTime(fallback),now);
 assert.equal(Object.keys(latestQuotes([fallback],now)).length,1);
 const invalid={...fallback,observed_at:'bad'};
 assert.equal(quoteTime(invalid),null);
 assert.deepEqual(latestQuotes([],now),{});
 assert.equal(bookQuotes([] as QuoteRow[],now,BEST_MAX_AGE_MS).size,0);
});
