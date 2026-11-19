import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const root = "docs/atlas/free-home-review/";
const hash = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
test("option-b artifact regenerates from replay without changing either approved package", async (t) => {
  const { freeHomeProposal } = await import(
    "../scripts/operations/atlas-free-home-prepare.mjs"
  );
  const temp = await mkdtemp(join(tmpdir(), "atlas-free-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await freeHomeProposal(temp);
  for (const f of [
    "free-home.sql",
    "free-home.sha256",
    "identities-after-free-home.sql",
    "identities-after-free-home.sha256",
    "catalog-assertions-after-free-home.sql",
    "manifest.json",
  ])
    assert.equal(
      await readFile(join(temp, f), "utf8"),
      await readFile(root + f, "utf8"),
      f,
    );
  for (const seal of [
    "docs/atlas/schema-review/review-package-sha256.json",
    "docs/atlas/schema-preparation/preparation-package-sha256.json",
  ])
    for (const [p, d] of Object.entries(
      JSON.parse(await readFile(seal, "utf8")).sha256,
    ))
      assert.equal(hash(await readFile(p)), d, p);
});
test("original free body is internal; live gate/age wrapper is the only free callsite change; paid SQL stays invoker", async () => {
  const m = JSON.parse(await readFile(root + "manifest.json", "utf8"));
  const sql = await readFile(root + "free-home.sql", "utf8");
  assert.equal(hash(sql), m.free_home_sha256);
  assert.match(
    sql,
    /revoke all on function private.free_challenge_desk\(\) from public,anon,authenticated,service_role/i,
  );
  assert.match(sql, /coalesce\(vq_private_access_stage.authorized\(\),false\)/);
  assert.match(sql, /coalesce\(private.age_member_allowed\(\),false\)/);
  assert.match(sql, /add column "slot" text/);
  assert.match(sql, /add column "created_at" timestamp with time zone/);
  assert(!/update public.games/i.test(sql));
  for (const f of m.public_adaptations) {
    assert.equal(hash(f.proposed_sql), f.proposed_sha256);
    assert(!/SECURITY DEFINER/i.test(f.proposed_sql));
    assert.equal(
      (
        f.proposed_sql.match(
          /vq_private_access_stage.free_challenge_desk\(\)/g,
        ) ?? []
      ).length,
      1,
    );
  }
});
test("I1 identity revision changes only two preservation queries, keeping all six identities and relative windows", async () => {
  const m = JSON.parse(await readFile(root + "manifest.json", "utf8"));
  const old = await readFile(
    "docs/atlas/schema-preparation/identities.sql",
    "utf8",
  );
  const next = await readFile(root + "identities-after-free-home.sql", "utf8");
  assert.equal(
    hash(old),
    "dcbc7c45a5bbac3bac5e23a1c738ac05c4b978e85f14511f1704ba373e6af197",
  );
  assert.equal(
    next,
    old.replaceAll("select x::text x from public.games x", m.game_projection),
  );
  assert.equal(hash(next), m.identity_proposed_sha256);
  assert.equal(m.original_game_columns.length, 11);
});
test("native rehearsal binds free and paid behavior, preservation and new exact hashes without hosted execution", async () => {
  const r = JSON.parse(await readFile(root + "rehearsal.json", "utf8"));
  assert.equal(r.status, "PASS");
  assert.equal(
    r.free_home_sha256,
    hash(await readFile(root + "free-home.sql")),
  );
  assert.equal(
    r.identity_sha256,
    hash(await readFile(root + "identities-after-free-home.sql")),
  );
  assert.equal(r.surfaces.length, 2);
  assert(
    r.surfaces.every(
      (s: any) =>
        s.free_equals_original &&
        s.paid_allowed &&
        s.paid_matches_original_except_new_columns,
    ),
  );
  assert.equal(
    r.final.filter((x: any) => x.phase === "preserved" && x.result === "PASS")
      .length,
    10,
  );
  assert(r.unrun.some((s: string) => s.includes("Hosted")));
});
