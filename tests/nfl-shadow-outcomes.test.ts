import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('shadow forecast outcomes are append-only and evaluation rows carry the closing price',()=>{
 execFileSync(process.execPath,['tests/sql/nfl-shadow-outcomes.mjs'],{stdio:'pipe'});
});
