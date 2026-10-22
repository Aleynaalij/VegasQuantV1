import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA paused: feeds collect once each morning in New York time, shadow scan dispatcher removed',()=>{
 execFileSync(process.execPath,['tests/sql/nba-daily-collection.mjs'],{stdio:'pipe'});
});
