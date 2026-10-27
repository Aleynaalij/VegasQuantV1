import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA shadow journal: snapshot-checked immutable forecasts, nba_grade evaluation with closing price, service-only',()=>{
 execFileSync(process.execPath,['tests/sql/nba-shadow.mjs'],{stdio:'pipe'});
});
