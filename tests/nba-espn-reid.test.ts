import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA feed moves a stored game to the id ESPN re-issued instead of failing the batch',()=>{
 execFileSync(process.execPath,['tests/sql/nba-espn-reid.mjs'],{stdio:'pipe'});
});
