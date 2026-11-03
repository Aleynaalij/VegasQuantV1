import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('composed notification/access cases execute through ordinary discovery', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap',
    fileURLToPath(new URL('./sql/notification-access-contracts.mjs', import.meta.url))],
    { encoding: 'utf8', timeout: 60000, env });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.equal(result.status, 0, result.error?.message || output);
  for (const summary of ['tests 6', 'pass 6', 'fail 0', 'cancelled 0', 'skipped 0', 'todo 0'])
    assert.match(output, new RegExp(`^# ${summary}$`, 'm'), output);
});
