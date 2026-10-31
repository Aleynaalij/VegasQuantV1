import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(
  "create role anon;create role authenticated;create role service_role bypassrls;create table public.sports_games(id uuid primary key);insert into public.sports_games values('00000000-0000-4000-8000-000000000001');",
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261031184000_sports_result_attempts.sql",
    "utf8",
  ),
);
await db.exec(
  readFileSync(
    "supabase/migrations/20261031185000_sports_context_attempts.sql",
    "utf8",
  ),
);
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await assert.rejects(
    db.query("select * from public.sports_result_attempts"),
    /permission denied/,
  );
  await assert.rejects(
    db.query("select * from public.sports_context_attempts"),
    /permission denied/,
  );
  await db.exec("reset role");
}
await db.exec(
  "set role service_role;insert into public.sports_result_attempts(game_id) values('00000000-0000-4000-8000-000000000001');update public.sports_result_attempts set attempted_at=now();",
);
assert.equal(
  (await db.query("select count(*)::int n from public.sports_result_attempts"))
    .rows[0].n,
  1,
);
await assert.rejects(
  db.query("delete from public.sports_result_attempts"),
  /permission denied/,
);
await db.exec(
  "insert into public.sports_context_attempts(game_id) values('00000000-0000-4000-8000-000000000001');update public.sports_context_attempts set next_attempt_at=now()+interval '6 hours';",
);
assert.equal(
  (
    await db.query(
      "select next_attempt_at>attempted_at+interval '5 hours' ok from public.sports_context_attempts",
    )
  ).rows[0].ok,
  true,
);
await assert.rejects(
  db.query("delete from public.sports_context_attempts"),
  /permission denied/,
);
await db.close();
