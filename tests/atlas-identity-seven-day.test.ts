import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
const root = "docs/atlas/identity-seven-day-review/";
const hash = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
test("seven-day proposal regenerates and differs only in five future interval constants", async (t) => {
  const { sevenDayIdentity } = await import(
    "../scripts/operations/atlas-identity-seven-day.mjs"
  );
  const folder = await mkdtemp(join(tmpdir(), "atlas-seven-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await sevenDayIdentity(folder);
  const old = await readFile(
    "docs/atlas/free-home-review/identities-after-free-home.sql",
    "utf8",
  );
  const next = await readFile(root + "identities-seven-day.sql", "utf8");
  assert.equal(
    hash(old),
    "ee6f722f496e8dc132e3206d50ecb8a0052ad02ead30c3d24b0fb2d96da7fba7",
  );
  assert.equal(
    next,
    await readFile(join(folder, "identities-seven-day.sql"), "utf8"),
  );
  const strip = (s: string) =>
    s.replace(
      /transaction_timestamp\(\)\+interval '(?:1 hour|24 hours|7 days|14 days)'/g,
      "FUTURE_BOUND",
    );
  assert.equal(strip(old), strip(next));
  assert.equal((next.match(/interval '7 days'/g) ?? []).length, 4);
  assert.equal((next.match(/interval '14 days'/g) ?? []).length, 1);
  assert.equal(
    (old.match(/interval '-?1 hour'/g) ?? []).length,
    (next.match(/interval '-?1 hour'/g) ?? []).length + 1,
  );
});
test("native seven-day bounds and all preservation checks pass without hosted identities", async () => {
  const r = JSON.parse(await readFile(root + "rehearsal.json", "utf8"));
  assert.equal(r.status, "PASS");
  assert.equal(
    r.sha256,
    hash(await readFile(root + "identities-seven-day.sql")),
  );
  assert.equal(r.sessions, 0);
  assert.equal(r.catalog.filter((x: any) => x.result === "PASS").length, 33);
  const future = r.windows.find((x: any) => x.email.startsWith("not-started-"));
  assert.equal(future.starts_days, 7);
  assert.equal(future.expires_days, 14);
  assert.equal(
    r.windows.find((x: any) => x.email.startsWith("active-")).expires_days,
    7,
  );
});
