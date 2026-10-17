import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('compact desk and batch tail-count database contracts',()=>{
 execFileSync(process.execPath,['tests/sql/compact-desk.mjs'],{stdio:'pipe'});
});
test('compact desk keeps only the latest analysis per game and no audit list',()=>{
 execFileSync(process.execPath,['tests/sql/desk-compact-analyses.mjs'],{stdio:'pipe'});
});
