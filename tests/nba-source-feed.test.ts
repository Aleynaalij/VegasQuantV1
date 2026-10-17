import test from 'node:test';
import { execFileSync } from 'node:child_process';
test('NBA feed tables: upsert by ESPN id, deduped append-only observations, service-only ingest and settings',()=>{
 execFileSync(process.execPath,['tests/sql/nba-source-feed.mjs'],{stdio:'pipe'});
});
