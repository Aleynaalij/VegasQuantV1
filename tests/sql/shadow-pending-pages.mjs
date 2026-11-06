// Synthetic SQL correctness checks, not a production query-plan/load benchmark.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

await test('shadow pending SQL contract', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  // One transaction fixes now() across all strict-boundary checks.
  await db.exec(`begin;
    create schema private;
    create table games(id uuid primary key, kickoff timestamptz);
    create table private.nfl_shadow_forecasts(id uuid primary key, game_id uuid, forecast jsonb, market text);
    create table private.nfl_shadow_outcomes(forecast_id uuid primary key);
    insert into games select md5(i::text)::uuid, now()-case i
      when 1 then interval '7 hours' when 2 then interval '6 hours'
      when 3 then interval '21 days' else interval '5 hours' end
      from generate_series(1,4) i;
    insert into private.nfl_shadow_forecasts select md5(i::text)::uuid,
      md5(((i%4)+1)::text)::uuid,
      '{"quote":{"player_id":"synthetic","season":2026,"week":9,"team":"SEA"}}',
      'rushing' from generate_series(1,12000) i;
    insert into private.nfl_shadow_outcomes select id from private.nfl_shadow_forecasts
      where game_id in (md5('1')::uuid,md5('3')::uuid);`);
  const migration = readFileSync(new URL('../../supabase/migrations/20261018051000_shadow_evaluation_pending.sql', import.meta.url), 'utf8');
  const start = migration.indexOf('create function public.nfl_shadow_pending_outcomes(');
  const end = migration.indexOf('$$;', start);
  assert.ok(start >= 0 && end > start, 'committed RPC definition must exist');
  // Execute the committed definition verbatim; no replacement eligibility/paging implementation.
  await db.exec(migration.slice(start, end + 3));
  const page = async (after = null, limit = 1000) =>
    (await db.query('select * from public.nfl_shadow_pending_outcomes($1::uuid,$2::int)', [after, limit])).rows;

  await t.test('first/later pages traverse all eligible IDs once, including an empty terminator', async () => {
    const expected = (await db.query("select id::text from private.nfl_shadow_forecasts where game_id=md5('1')::uuid order by id")).rows.map(r => r.id);
    let after = null, ids = [], sizes = [];
    for (let i = 0; i < 5; i++) {
      const rows = await page(after);
      sizes.push(rows.length);
      ids.push(...rows.map(r => r.forecast_id));
      if (rows.length < 1000) break;
      after = rows.at(-1).forecast_id;
    }
    assert.deepEqual(sizes, [1000, 1000, 1000, 0]);
    assert.equal(expected.length, 3000);
    assert.deepEqual(ids, expected);
    assert.equal(new Set(ids).size, ids.length);
  });
  await t.test('exact six-hour and graded 21-day boundaries stay excluded', async () => {
    const ids = (await page()).map(r => r.forecast_id);
    const excluded = (await db.query("select id::text from private.nfl_shadow_forecasts where game_id<>md5('1')::uuid")).rows.map(r => r.id);
    const set = new Set(excluded);
    assert.ok(ids.length > 0);
    assert.ok(ids.every(id => !set.has(id)));
  });
  await t.test('old ungraded forecasts remain pending and source fields survive the RPC', async () => {
    const id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await db.query(`insert into private.nfl_shadow_forecasts values ($1,md5('3')::uuid,
      '{"quote":{"player_id":"old-synthetic","season":2025,"week":4,"team":"SEA"}}','receiving')`, [id]);
    const rows = await page('ffffffff-ffff-ffff-ffff-fffffffffffe');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].forecast_id, id);
    assert.deepEqual([rows[0].player_id, rows[0].season, rows[0].week, rows[0].team, rows[0].market], ['old-synthetic', 2025, 4, 'SEA', 'receiving']);
  });
  await t.test('server page limits remain clamped to the existing 1 through 1000 contract', async () => {
    assert.equal((await page(null, 5000)).length, 1000);
    assert.equal((await page(null, 0)).length, 1);
    assert.equal((await page(null, -1)).length, 1);
    assert.equal((await page('ffffffff-ffff-ffff-ffff-ffffffffffff')).length, 0);
  });
});
