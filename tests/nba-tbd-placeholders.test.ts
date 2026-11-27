import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA feed skips Cup TBD placeholders and fills their teams later instead of failing',()=>{
 execFileSync(process.execPath,['tests/sql/nba-tbd-placeholders.mjs'],{stdio:'pipe'});
});
