import test from 'node:test';
import assert from 'node:assert/strict';
import {GET} from '../src/app/api/simulator/research/route';
test('research endpoint denies anonymous and non-admin access; admin receives verified artifact',async()=>{
 const original=globalThis.fetch;let allow=false;let reads=0;
 globalThis.fetch=async(input)=>{const url=String(input instanceof Request?input.url:input);reads++;if(url.includes('/auth/v1/user'))return Response.json({id:'00000000-0000-0000-0000-000000000001',email:'fixture@example.test',email_confirmed_at:'2026-10-01T00:00:00Z',aud:'authenticated',role:'authenticated'});if(url.includes('/rest/v1/rpc/is_admin'))return Response.json(allow);throw new Error('Unexpected external request')};
 try{
  const anonymous=await GET(new Request('https://vegasquant.app/api/simulator/research'));assert.equal(anonymous.status,401);assert.equal(reads,0);
  const request=()=>new Request('https://vegasquant.app/api/simulator/research',{headers:{Authorization:'Bearer fixture-token'}});
  assert.equal((await GET(request())).status,403);allow=true;
  const result=await GET(request());assert.equal(result.status,200);assert.match(result.headers.get('Cache-Control')||'',/private, no-store/);const body=await result.json();assert.equal(body.run.runs.actual,10000);assert.equal(body.run.is_current_matchup,false);assert.equal(body.calibration.adopted,false);
 }finally{globalThis.fetch=original;}
});
