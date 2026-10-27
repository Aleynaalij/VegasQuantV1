import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('Supabase starts the shadow model scan once per fresh FanDuel prop batch',()=>{
 execFileSync(process.execPath,['tests/sql/model-scan-dispatch.mjs'],{stdio:'pipe'});
});
