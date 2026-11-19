// New proposal rehearsal only; the approved preparation/rehearsal files stay unchanged.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { hash } from "./atlas-schema-review.mjs";
if (!process.env.ATLAS_PREPARATION_CLUSTER)
  throw Error("Disposable loopback harness required");
const out = process.argv[process.argv.indexOf("--out") + 1];
await import("./atlas-schema-preparation-rehearsal.mjs");
if (process.exitCode) throw Error("Approved preparation rehearsal failed");
await rename(
  out + "/rehearsal.json",
  out + "/approved-preparation-rehearsal.json",
);
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
  (await db.query("select current_setting('data_directory') dir")).rows[0]
    .dir !== process.env.ATLAS_PREPARATION_CLUSTER
)
  throw Error("Wrong cluster");
const root = "docs/atlas/free-home-review/";
const read = async (p) => readFile(p, "utf8");
const sql = await read(root + "free-home.sql");
const manifest = JSON.parse(await read(root + "manifest.json"));
const identities = JSON.parse(
  await read("docs/atlas/schema-preparation/identity-map.json"),
).identities;
const report = {
  status: "RUNNING",
  scope: "DISPOSABLE_NATIVE_ONLY_NO_HOSTED_EXECUTION",
  free_home_sha256: hash(sql),
  identity_sha256: hash(await read(root + "identities-after-free-home.sql")),
  checks: [],
};
try {
  // The imported local rehearsal deliberately leaves six inert local controls.
  // Remove ONLY those six local fixture identities to reproduce current hosted four-user state.
  for (const i of identities) {
    for (const t of [
      "vq_private_access_stage.private_development_owners",
      "vq_private_access_stage.entitlements",
      "vq_fixture.age_states",
      "vq_fixture.entitlements",
    ])
      await db.query(`delete from ${t} where user_id=$1`, [i.id]);
    await db.query("delete from auth.users where id=$1", [i.id]);
  }
  assert.equal(
    (await db.query("select count(*)::int n from auth.users")).rows[0].n,
    4,
  );
  const snap = JSON.parse(
    await read("docs/atlas/schema-preparation/reduced-staging-snapshot.json"),
  );
  const oldMember = snap.data
    .find((t) => t.name === "vq_fixture.entitlements")
    .rows.find(
      (e) =>
        e.allowed &&
        snap.data
          .find((t) => t.name === "vq_fixture.age_states")
          .rows.some((a) => a.user_id === e.user_id && a.verified),
    ).user_id;
  const paidBefore = {};
  await db.query("begin");
  await db.query(
    "insert into vq_private_access_stage.private_development_owners(user_id) values($1)",
    [oldMember],
  );
  await db.query(
    "insert into vq_private_access_stage.entitlements(user_id) values($1)",
    [oldMember],
  );
  await db.query(
    "insert into auth.sessions(id,user_id,aal,not_after) values('00000000-0000-4000-8000-000000009999',$1,'aal2',now()+interval '1 hour')",
    [oldMember],
  );
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({
      sub: oldMember,
      session_id: "00000000-0000-4000-8000-000000009999",
      aal: "aal2",
      role: "authenticated",
      is_anonymous: false,
    }),
  ]);
  await db.query("set local role authenticated");
  for (const fn of ["public.desk_data", "public.desk_data_compact"])
    paidBefore[fn] = (await db.query(`select ${fn}() value`)).rows[0].value;
  await db.query("rollback");
  // Full rollback rehearsal: new columns and body/callsite/ACL changes all disappear.
  await db.query(sql.replace(/commit;\s*$/, "rollback;"));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from pg_attribute where attrelid='public.games'::regclass and attname in ('slot','created_at') and not attisdropped",
      )
    ).rows[0].n,
    0,
  );
  report.checks.push({
    name: "Full free-Home transaction rollback restores columns, original denial/callsites and privileges",
    result: "PASS",
  });
  await db.query(sql);
  report.assertions = (
    await db.query(await read(root + "catalog-assertions-after-free-home.sql"))
  ).rows;
  assert.equal(report.assertions.length, 33);
  assert(report.assertions.every((r) => r.result === "PASS"));
  const original = (
    await db.query(
      "select pg_get_functiondef('private.free_challenge_desk()'::regprocedure) d",
    )
  ).rows[0].d;
  assert.equal(hash(original), manifest.original_free_sha256);
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('authenticated','private.free_challenge_desk()','EXECUTE') ok",
      )
    ).rows[0].ok,
    false,
  );
  report.checks.push({
    name: "Original free helper byte-identical; internal-only ACL; original-column preservation 10/10; both public desk functions stay invoker",
    result: "PASS",
  });
  // Prove why the old approved identity bytes must not be executed after option (b).
  await assert.rejects(
    db.query(await read("docs/atlas/schema-preparation/identities.sql")),
    /Staging catalog check failed/,
  );
  await db.query("rollback");
  assert.equal(
    (await db.query("select count(*)::int n from auth.users")).rows[0].n,
    4,
  );
  await db.query(await read(root + "identities-after-free-home.sql"));
  report.checks.push({
    name: "Old whole-row identity check rejects; projection-only revision succeeds without changing identity state/windows",
    result: "PASS",
  });
  // Local synthetic sessions only; all rows and claims below are rolled back.
  await db.query("begin");
  const active = identities.find((i) => i.email.startsWith("active-verified@"));
  const free = identities.find((i) =>
    i.email.startsWith("unentitled-verified@"),
  );
  const unverified = identities.find((i) =>
    i.email.startsWith("entitled-unverified@"),
  );
  const sessions = new Map();
  for (const [i, c] of [active, free, unverified].entries()) {
    const sid = `00000000-0000-4000-8000-${String(9100 + i).padStart(12, "0")}`;
    sessions.set(c.id, sid);
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal2',now()+interval '1 hour')",
      [sid, c.id],
    );
  }
  const asUser = async (c) => {
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: c.id,
        session_id: sessions.get(c.id),
        aal: "aal2",
        role: "authenticated",
        is_anonymous: false,
      }),
    ]);
    await db.query("set local role authenticated");
  };
  report.surfaces = [];
  for (const fn of ["public.desk_data", "public.desk_data_compact"]) {
    await asUser(free);
    assert.equal(
      (await db.query("select vq_private_access_stage.authorized() ok")).rows[0]
        .ok,
      true,
    );
    assert.equal(
      (await db.query("select private.has_membership() ok")).rows[0].ok,
      false,
    );
    const value = (await db.query(`select ${fn}() value`)).rows[0].value;
    assert.equal(value.free_core, true);
    assert.equal(value.access.allowed, false);
    assert.equal(value.games.length, 1);
    assert.equal(value.games[0].slot, null);
    assert.equal(value.games[0].created_at, null);
    await db.query("reset role");
    const originalValue = (
      await db.query("select private.free_challenge_desk() value")
    ).rows[0].value;
    assert.deepEqual(value, originalValue);
    await asUser(active);
    const member = (await db.query(`select ${fn}() value`)).rows[0].value;
    assert.equal(member.access.allowed, true);
    assert(!member.free_core);
    assert.equal(member.games.length, 1);
    const normalized = JSON.parse(JSON.stringify(member));
    for (const game of normalized.games) {
      delete game.slot;
      delete game.created_at;
    }
    assert.deepEqual(
      normalized,
      paidBefore[fn],
      fn + " paid output unchanged except two new nullable game fields",
    );
    report.surfaces.push({
      rpc: fn,
      free_core: true,
      free_member: false,
      free_games: 1,
      free_equals_original: true,
      paid_allowed: true,
      paid_matches_original_except_new_columns: true,
      result: "PASS",
    });
  }
  // Paid branch remains the original SQL invoker body, so own-row RLS is not bypassed.
  for (const a of manifest.public_adaptations) {
    const row = (
      await db.query(
        "select prosecdef,pg_get_functiondef(oid) d from pg_proc where oid=$1::regprocedure",
        [a.signature],
      )
    ).rows[0];
    assert.equal(row.prosecdef, false);
    assert.equal(hash(row.d), a.proposed_sha256);
  }
  await db.query("reset role");
  await db.query(
    "update auth.sessions set not_after=now()-interval '1 minute' where id=$1",
    [sessions.get(free.id)],
  );
  await asUser(free);
  await db.query("savepoint gate_denial");
  await assert.rejects(
    db.query("select public.desk_data_compact()"),
    /live verified-age gate/,
  );
  await db.query("rollback to savepoint gate_denial");
  await asUser(unverified);
  await db.query("savepoint age_denial");
  await assert.rejects(
    db.query("select public.desk_data_compact()"),
    /live verified-age gate/,
  );
  await db.query("rollback to savepoint age_denial");
  for (const query of [
    "select private.free_challenge_desk()",
    "select vq_private_access_stage.free_challenge_desk()",
    "select public.desk_data_compact()",
  ]) {
    await db.query("reset role");
    await db.query("set local role anon");
    await db.query("savepoint anon_denial");
    await assert.rejects(db.query(query), /permission denied/);
    await db.query("rollback to savepoint anon_denial");
  }
  await db.query("rollback");
  await db.query("select set_config('request.jwt.claims','{}',false)");
  assert.equal(
    (await db.query("select count(*)::int n from auth.sessions")).rows[0].n,
    0,
  );
  report.checks.push({
    name: "Free verified live-gate user gets exact original content; paid path stays invoker; expired gate, unverified age and anonymous callers deny",
    result: "PASS",
  });
  report.final = (
    await db.query(await read(root + "catalog-assertions-after-free-home.sql"))
  ).rows;
  assert(report.final.every((r) => r.result === "PASS"));
  report.unrun = [
    "Hosted free-Home patch execution (awaits exact-hash review)",
    "Actual hosted free-Home UI and independent Elo journeys",
    "Revised identity SQL execution: after catalog sign-off and deployment probes, right before tests (I1)",
  ];
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.error = e.message;
  console.error(e);
  process.exitCode = 1;
  await db.query("rollback").catch(() => {});
} finally {
  await mkdir(out, { recursive: true });
  await writeFile(
    out + "/free-home-rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
}
