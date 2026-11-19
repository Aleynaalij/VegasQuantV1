// Authorization rehearsal ONLY. No Auth HTTP, passwords, factors or hosted writes.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
await import("./atlas-identity-seven-day-rehearsal.mjs");
if (process.exitCode)
  throw Error("Approved preparation/identity rehearsal failed");
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
const out = process.argv[process.argv.indexOf("--out") + 1];
const report = {
  status: "RUNNING",
  scope: "LOCAL_AUTHORIZATION_ONLY_NOT_PASSWORD_OR_TOTP_ENROLLMENT",
  cases: [],
};
try {
  assert(process.env.ATLAS_PREPARATION_CLUSTER);
  assert.equal(
    (await db.query("select current_setting('data_directory') d")).rows[0].d,
    process.env.ATLAS_PREPARATION_CLUSTER,
  );
  const { identities } = JSON.parse(
    await readFile(
      "docs/atlas/staging-sign-in-review/account-map.json",
      "utf8",
    ),
  );
  for (const r of identities.filter((r) => r.kind === "owner")) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data) values($1,$2,now(),'authenticated','authenticated',false,'{}','{}')",
      [r.id, r.email],
    );
  }
  const ownerSql = await readFile(
    "docs/atlas/staging-sign-in-review/owner-support.sql",
    "utf8",
  );
  await db.query(ownerSql);
  await assert.rejects(
    db.query(ownerSql),
    /Owner support preconditions failed/,
  );
  await db.query("rollback");
  report.owner_support_single_use = "PASS";
  async function check(r, sid, aal) {
    await db.query("begin");
    try {
      await db.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({
          sub: r.id,
          session_id: sid,
          aal,
          role: "authenticated",
          is_anonymous: false,
        }),
      ]);
      await db.query("set local role authenticated");
      return (
        await db.query(
          "select public.vq_private_access_stage_authorized() gate, private.has_membership() member",
        )
      ).rows[0];
    } finally {
      await db.query("rollback");
    }
  }
  for (const [i, r] of identities.entries()) {
    const sid = `00000000-0000-4000-8000-${String(9900 + i).padStart(12, "0")}`;
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal1',now()+interval '1 hour')",
      [sid, r.id],
    );
    const pre = await check(r, sid, "aal1");
    assert.equal(pre.gate, false, r.email + " pre-MFA");
    await db.query("update auth.sessions set aal='aal2' where id=$1", [sid]);
    const post = await check(r, sid, "aal2");
    assert.equal(post.gate, true, r.email + " AAL2 live gate");
    assert.equal(post.member, r.expected_member, r.email + " membership state");
    await db.query("delete from auth.sessions where id=$1", [sid]);
    const revoked = await check(r, sid, "aal2");
    assert.equal(revoked.gate, false, r.email + " revoked session");
    report.cases.push({
      email: r.email,
      pre_mfa_gate: pre.gate,
      aal2_gate: post.gate,
      member: post.member,
      expected_member: r.expected_member,
      revoked_session_gate: revoked.gate,
      result: "PASS",
    });
  }
  assert.equal(
    (await db.query("select count(*)::int n from auth.sessions")).rows[0].n,
    0,
  );
  const checks = (
    await db.query(
      await readFile(
        "docs/atlas/free-home-review/catalog-assertions-after-free-home.sql",
        "utf8",
      ),
    )
  ).rows;
  assert(checks.every((r) => r.result === "PASS"));
  report.catalog_checks = checks.length;
  report.sessions_after = 0;
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.error = e.message;
  process.exitCode = 1;
} finally {
  await writeFile(
    out + "/sign-in-authorization-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
}
