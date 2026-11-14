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
      create role anon; create role authenticated; create role service_role; create schema auth; create schema private;
      create table auth.users(id uuid primary key, email_confirmed_at timestamptz, is_anonymous boolean, banned_until timestamptz);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
      create table private.account_erasure_jobs(user_id uuid, expires_at timestamptz);
      create function auth.jwt() returns jsonb language sql as $$
        select current_setting('request.jwt.claims',true)::jsonb $$;
      create function auth.uid() returns uuid language sql as $$
        select (auth.jwt()->>'sub')::uuid $$;
    `);
    await db.exec(
      readFileSync("scripts/operations/blackbox-staging.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-phase2.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-active-session.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-phase3.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-phase3-review-fix.sql", "utf8"),
    );
    await db.exec(
      readFileSync("scripts/operations/blackbox-phase3-validate.sql", "utf8"),
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

test("independent manifest rejects missing, reordered, altered evidence and changed memory", async () => {
  const { createManifest, verifyManifest } = await import(
    "../scripts/operations/blackbox-integrity"
  );
  const snapshot = {
    project: "apwndmcsjxzjxnpxfywo",
    tasks: [
      {
        id: "test",
        version: 2,
        events: [
          {
            task_id: "test",
            version: 1,
            action: "submit",
            evidence: "Observed A",
          },
          {
            task_id: "test",
            version: 2,
            action: "approve",
            evidence: "Reviewed A",
          },
        ],
        outcomes: [
          { task_id: "test", version: 2, outcome: { conclusion: "A" } },
        ],
      },
    ],
  };
  const key = "ab".repeat(32);
  const manifest = createManifest(snapshot, key, "2026-11-14T00:00:00Z");
  verifyManifest(snapshot, manifest, key);
  for (const alter of [
    (copy: typeof snapshot) => copy.tasks[0].events.pop(),
    (copy: typeof snapshot) => copy.tasks[0].events.reverse(),
    (copy: typeof snapshot) => {
      copy.tasks[0].events[0].evidence = "Altered";
    },
    (copy: typeof snapshot) => {
      copy.tasks[0].outcomes[0].outcome.conclusion = "Altered";
    },
    (copy: typeof snapshot) => {
      copy.tasks = [];
    },
  ]) {
    const copy = structuredClone(snapshot);
    alter(copy);
    assert.throws(() => verifyManifest(copy, manifest, key));
  }
  assert.throws(
    () => verifyManifest(snapshot, manifest, "bc".repeat(32)),
    /signature/,
  );
});
