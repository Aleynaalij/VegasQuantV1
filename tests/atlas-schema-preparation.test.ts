import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
const hash = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
const root = "docs/atlas/schema-preparation/";
test("preparation regenerates exact SQL, identities, inventory and assertions; approved bf1c08a package stays sealed", async (t) => {
  const { generatePreparation } = await import(
    "../scripts/operations/atlas-schema-prepare.mjs"
  );
  const folder = await mkdtemp(join(tmpdir(), "atlas-prepare-test-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await generatePreparation(folder);
  for (const name of [
    "prepare.sql",
    "prepare.sha256",
    "identities.sql",
    "identities.sha256",
    "inventory.json",
    "post-preparation-assertions.sql",
  ])
    assert.equal(
      await readFile(join(folder, name), "utf8"),
      await readFile(root + name, "utf8"),
      name,
    );
  const prior = JSON.parse(
    await readFile(
      "docs/atlas/schema-review/review-package-sha256.json",
      "utf8",
    ),
  );
  for (const [path, digest] of Object.entries(prior.sha256))
    assert.equal(hash(await readFile(path)), digest, path);
});
test("execution request requires exact approved bytes and pins staging outside the SQL assertion", async () => {
  const { preparationRequest } = await import(
    "../scripts/operations/atlas-schema-preparation-request.mjs"
  );
  const approvedSha256 = hash(await readFile(root + "prepare.sql"));
  const args = {
    artifact: "prepare",
    approvedSha256,
    signoffUrl:
      "https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-12345",
  };
  await assert.rejects(preparationRequest(), /artifact/);
  await assert.rejects(
    preparationRequest({ ...args, target: "uowearboulykfcwnuirn" }),
    /staging/,
  );
  await assert.rejects(
    preparationRequest({ ...args, approvedSha256: "0".repeat(64) }),
    /hash differs/,
  );
  await assert.rejects(
    preparationRequest({ ...args, signoffUrl: "https://example.invalid" }),
    /sign-off/,
  );
  const request = await preparationRequest(args);
  assert.equal(request.project_id, "caynldluziwrzmvuslzg");
  assert.equal(hash(request.query), approvedSha256);
  assert.doesNotMatch(
    request.query,
    /insert into auth\.(users|sessions|identities|mfa_)/i,
  );
  assert.match(request.query, /lock table .*public\.published_legs/s);
  assert.match(request.query, /Archive OID changed/);
});
test("C1 managed schemas excluded, word-boundary net regex used, C3 adaptations included exactly, identity process has no login material", async () => {
  const sql = await readFile(root + "prepare.sql", "utf8");
  const strict = await readFile(
    root + "post-preparation-assertions.sql",
    "utf8",
  );
  assert.match(
    strict,
    /nspname not in \('pg_catalog','information_schema','extensions','vault'/,
  );
  assert(strict.includes("~ '\\mnet\\.'"));
  assert(!strict.includes("like '%net.%'"));
  const adapt = JSON.parse(
    await readFile("docs/atlas/schema-review/adaptations.json", "utf8"),
  );
  for (const a of adapt.proposed_functions) {
    assert.equal(hash(a.proposed_sql), a.proposed_sha256);
    assert(sql.includes(a.proposed_sql.trimEnd()));
  }
  assert.match(sql, /set local check_function_bodies=true/);
  assert.match(
    sql,
    /Anonymous\/free consumer contracts are unavailable on isolated staging/,
  );
  const identity = await readFile(root + "identities.sql", "utf8");
  assert.equal((identity.match(/insert into auth\.users\(/gi) ?? []).length, 6);
  assert(
    !/insert into auth\.(sessions|identities|mfa_factors)/i.test(identity),
  );
  assert(
    !/insert into (private\.admin_users|public\.ruby_contributors)/i.test(
      identity,
    ),
  );
  assert(!/values[^;]*(?:@gmail|@outlook)/i.test(identity));
});
test("rehearsal seals bind positive/negative controls, grants, preservation and actual script hashes without hosted acceptance claims", async () => {
  const evidence = JSON.parse(await readFile(root + "rehearsal.json", "utf8"));
  assert.equal(evidence.status, "PASS");
  assert.equal(
    evidence.preparation_sha256,
    hash(await readFile(root + "prepare.sql")),
  );
  assert.equal(
    evidence.identity_sha256,
    hash(await readFile(root + "identities.sql")),
  );
  assert.equal(evidence.negative_controls.length, 6);
  assert(
    evidence.negative_controls.every(
      (c: any) =>
        c.gate &&
        c.result === "PASS" &&
        c.ruby_view_rows === (c.expected_member ? 1 : 0) &&
        c.inbox_rpc_items === (c.expected_member ? 1 : 0),
    ),
  );
  assert.equal(
    evidence.final.filter(
      (r: any) => r.phase === "preserved" && r.result === "PASS",
    ).length,
    10,
  );
  assert.equal(evidence.rls_disabled.length, 3);
  assert(
    evidence.rls_disabled.every(
      (r: any) => !r.authenticated_access && !r.anon_access,
    ),
  );
  assert(evidence.unrun.some((s: string) => s.includes("Hosted")));
  const delivery = JSON.parse(
    await readFile(root + "preparation-package-sha256.json", "utf8"),
  );
  for (const [path, digest] of Object.entries(delivery.sha256))
    assert.equal(hash(await readFile(path)), digest, path);
});
