import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { blackboxEnabled } from "../src/lib/blackbox";

test("Blackbox requires the exact isolated project, explicit activation and a preview runtime", () => {
  const staging = {
    VERCEL_ENV: "preview",
    VQ_BLACKBOX_STAGING: "true",
    NEXT_PUBLIC_SUPABASE_URL: "https://apwndmcsjxzjxnpxfywo.supabase.co",
  };
  assert.equal(blackboxEnabled(staging), true);
  assert.equal(
    blackboxEnabled({ ...staging, VERCEL_ENV: "production" }),
    false,
  );
  assert.equal(
    blackboxEnabled({ ...staging, VQ_BLACKBOX_STAGING: undefined }),
    false,
  );
  assert.equal(
    blackboxEnabled({
      ...staging,
      NEXT_PUBLIC_SUPABASE_URL: "https://uowearboulykfcwnuirn.supabase.co",
    }),
    false,
  );
});

test("Blackbox SQL enforces the synthetic lifecycle, audit isolation and denial controls", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.jwt() returns jsonb language sql as $$
        select current_setting('request.jwt.claims',true)::jsonb $$;
      create function auth.uid() returns uuid language sql as $$
        select (auth.jwt()->>'sub')::uuid $$;
    `);
    await db.exec(
      readFileSync("scripts/operations/blackbox-staging.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-validate.sql", "utf8"),
    );
    const result = await db.query(
      "select count(*)::int as count from blackbox.events",
    );
    assert.deepEqual(result.rows, [{ count: 0 }]);
  } finally {
    await db.close();
  }
});
