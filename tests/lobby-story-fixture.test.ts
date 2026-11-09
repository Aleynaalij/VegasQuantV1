import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {tonightGames,tonightWindow} from '../src/lib/vq-tonight';
// Exercise the exact pure fixture helper without importing the browser executable script
// (which launches Chromium immediately). No timers or application clocks are replaced.
const source=readFileSync('scripts/ui-smoke/lobby-stories.mjs','utf8');
const start=source.indexOf('function scheduledFixtureTimes(url) {');
const end=source.indexOf('\nconst { chromium }',start);
assert.ok(start>=0&&end>start);
const times=new Function(`${source.slice(start,end)};return scheduledFixtureTimes;`)() as (url:URL)=>string[];
const request=(start:number,end:number)=>new URL(`http://127.0.0.1:54321/rest/v1/nba_games?tipoff=gte.${new Date(start).toISOString()}&tipoff=lt.${new Date(end).toISOString()}`);
for(const instant of ['2026-11-09T03:34:32Z','2026-11-09T04:59:59Z','2026-11-09T05:00:01Z','2026-03-08T16:00:00Z','2026-11-01T16:00:00Z'])test(`five fixture games survive production ET-day filtering at ${instant}`,()=>{
 const now=Date.parse(instant),day=tonightWindow(now),starts=times(request(day.start,day.end));
 assert.equal(starts.length,5);assert.equal(new Set(starts).size,5);
 const rows=starts.map((start,i)=>({sport:'nba' as const,id:`synthetic-${i}`,away:'Synthetic Away',home:'Synthetic Home',start,tbd:false,status:'STATUS_SCHEDULED',href:'/nba/games/synthetic'}));
 assert.equal(tonightGames(rows,now).length,5);
 assert.ok(starts.every(t=>Date.parse(t)>=day.start&&Date.parse(t)<day.end));
});
test('missing, duplicate, invalid or reversed day filters fail rather than guessing',()=>{
 for(const query of ['', 'tipoff=gte.2026-11-09T05:00:00Z','tipoff=gte.bad&tipoff=lt.bad','tipoff=gte.2026-11-10T05:00:00Z&tipoff=lt.2026-11-09T05:00:00Z','tipoff=gte.2026-11-09T05:00:00Z&tipoff=gte.2026-11-09T05:00:00Z&tipoff=lt.2026-11-10T05:00:00Z']) assert.throws(()=>times(new URL(`http://127.0.0.1/nba_games?${query}`)),/NBA fixture requires/);
});
test('negative control reproduces the original CI midnight spill',()=>{
 const now=Date.parse('2026-11-09T03:34:32Z');
 const rows=Array.from({length:5},(_,i)=>({sport:'nba' as const,id:`old-${i}`,away:'Away',home:'Home',start:new Date(now+(30+i*15)*60000).toISOString(),tbd:false,status:'STATUS_SCHEDULED',href:'/nba/games/synthetic'}));
 assert.equal(tonightGames(rows,now).length,4,'old relative-now fixture loses the fifth game after ET midnight');
});
