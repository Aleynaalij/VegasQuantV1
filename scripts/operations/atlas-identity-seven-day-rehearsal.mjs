// Native local-only identity timing rehearsal; no hosted identity or session action.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { hash } from "./atlas-schema-review.mjs";
if (!process.env.ATLAS_PREPARATION_CLUSTER)
  throw Error("Disposable loopback harness required");
await import("./atlas-free-home-rehearsal.mjs");
if (process.exitCode) throw Error("Prior approved rehearsal failed");
const out = process.argv[process.argv.indexOf("--out") + 1];
const { default: pg } = await import(
  pathToFileURL(process.env.ATLAS_REPLAY_PG_MODULE)
);
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  database: "atlas_schema_preparation",
});
await db.connect();
if (
  (await db.query("select current_setting('data_directory') d")).rows[0].d !==
  process.env.ATLAS_PREPARATION_CLUSTER
)
  throw Error("Wrong local cluster");
const sql = await readFile(
  "docs/atlas/identity-seven-day-review/identities-seven-day.sql",
  "utf8",
);
const ids = JSON.parse(
  await readFile("docs/atlas/schema-preparation/identity-map.json", "utf8"),
).identities;
const report = {
  status: "RUNNING",
  scope: "DISPOSABLE_NATIVE_ONLY_NO_HOSTED_IDENTITIES",
  sha256: hash(sql),
};
try {
  for (const i of ids) {
    for (const t of [
      "vq_private_access_stage.private_development_owners",
      "vq_private_access_stage.entitlements",
      "vq_fixture.age_states",
      "vq_fixture.entitlements",
    ])
      await db.query(`delete from ${t} where user_id=$1`, [i.id]);
    await db.query("delete from auth.users where id=$1", [i.id]);
  }
  await db.query(sql);
  report.windows = (
    await db.query(
      `select u.email,round(extract(epoch from(e.starts_at-u.email_confirmed_at))/86400,6)::float8 starts_days,round(extract(epoch from(e.expires_at-u.email_confirmed_at))/86400,6)::float8 expires_days,e.allowed,e.revoked_at is not null revoked from vq_fixture.entitlements e join auth.users u on u.id=e.user_id where u.email=any($1) order by u.email`,
      [ids.map((i) => i.email)],
    )
  ).rows;
  assert.equal(report.windows.length, 6);
  for (const r of report.windows) {
    if (r.email.startsWith("not-started-")) {
      assert.equal(r.starts_days, 7);
      assert.equal(r.expires_days, 14);
    } else if (
      ["active-", "entitled-", "revoked-"].some((p) => r.email.startsWith(p))
    )
      assert.equal(r.expires_days, 7);
  }
  report.catalog = (
    await db.query(
      await readFile(
        "docs/atlas/free-home-review/catalog-assertions-after-free-home.sql",
        "utf8",
      ),
    )
  ).rows;
  assert(report.catalog.every((r) => r.result === "PASS"));
  report.sessions = (
    await db.query("select count(*)::int n from auth.sessions")
  ).rows[0].n;
  assert.equal(report.sessions, 0);
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.error = e.message;
  process.exitCode = 1;
  console.error(e);
} finally {
  await writeFile(
    out + "/identity-seven-day-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
}
