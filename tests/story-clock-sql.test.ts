import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('story clock executes with explicit authenticated-only grants and no content access',()=>{
 execFileSync(process.execPath,['tests/sql/story-clock.mjs'],{stdio:'pipe'});
});
