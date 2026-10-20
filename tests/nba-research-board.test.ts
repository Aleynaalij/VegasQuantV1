import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA research board: gated, immutable, member-readable research legs graded by nba_grade',()=>{
 execFileSync(process.execPath,['tests/sql/nba-research-board.mjs'],{stdio:'pipe'});
});
