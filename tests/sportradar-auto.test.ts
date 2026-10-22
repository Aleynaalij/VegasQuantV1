import test from 'node:test';
import assert from 'node:assert/strict';
import {collectionGames,scheduleGames} from '../src/lib/sportradar-auto';
const now=Date.parse('2026-10-23T00:15:00Z');
const game={id:'c5ec75e3-b11f-4abd-bf6f-4ff1b58e28f0',scheduled:new Date(now).toISOString(),status:'created',home:{id:'00000000-0000-4000-8000-000000000001',alias:'CHI'},away:{id:'00000000-0000-4000-8000-000000000002',alias:'NE'}};
const payload=(g=game)=>({week:{games:[g]}});
test('automatic collection starts no earlier than ten minutes before kickoff and has a bounded six hour window',()=>{
 assert.equal(collectionGames(payload(),now-600001).length,0);
 assert.equal(collectionGames(payload(),now-600000).length,1);
 assert.equal(collectionGames(payload(),now+6*3600000).length,0);
 assert.equal(collectionGames(payload({...game,status:'postponed'}),now).length,0);
});
test('automatic schedule validation rejects missing team identity and malformed provider IDs',()=>{
 assert.equal(scheduleGames(payload())[0].id,game.id);
 assert.throws(()=>scheduleGames({week:{games:[{...game,home:{alias:'CHI'}}]}}),/schedule_schema_unverified/);
 assert.throws(()=>scheduleGames({week:{games:[{...game,id:'guessed-game'}]}}),/schedule_schema_unverified/);
});
