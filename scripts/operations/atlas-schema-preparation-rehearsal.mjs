// DISPOSABLE LOOPBACK ONLY. No remote DSN, credentials, API, real login or delivery.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { hash, splitSql } from "./atlas-schema-review.mjs";
import assert from "node:assert/strict";
const { default: pg } = await import(
  pathToFileURL(process.env.ATLAS_REPLAY_PG_MODULE)
);
const output = process.argv[process.argv.indexOf("--out") + 1];
if (!process.env.ATLAS_PREPARATION_CLUSTER || !output)
  throw Error("Run only through the disposable cluster harness");
let control;
for (let i = 0; i < 30; i++) {
  control = new pg.Client({
    host: "127.0.0.1",
    port: 55439,
    user: "postgres",
    database: "postgres",
  });
  try {
    await control.connect();
    break;
  } catch {
    await control.end();
    await new Promise((r) => setTimeout(r, 100));
  }
}
if (
  (await control.query("select current_setting('data_directory') dir")).rows[0]
    .dir !== process.env.ATLAS_PREPARATION_CLUSTER
)
  throw Error("Wrong disposable cluster");
await control.query("create database atlas_schema_preparation");
await control.end();
const db = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  database: "atlas_schema_preparation",
});
await db.connect();
const dir = "docs/atlas/schema-preparation";
const read = async (p) => readFile(p, "utf8");
const snapshot = JSON.parse(await read(dir + "/reduced-staging-snapshot.json"));
const observed = JSON.parse(
  await read("docs/atlas/schema-review/observed-staging.json"),
);
const sql = await read(dir + "/prepare.sql");
const report = {
  status: "RUNNING",
  preparation_sha256: hash(sql),
  engine: (await db.query("select version() v")).rows[0].v,
  scope:
    "Native local only; managed Auth/storage structural stand-ins; no hosted equivalence or acceptance claim",
  checks: [],
};
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
const lit = (s) => "'" + s.replaceAll("'", "''") + "'";
try {
  const platform = await read(
    "docs/atlas/schema-review/local-replay-platform.sql",
  );
  const safe = splitSql(platform)
    .map((u) => u.sql)
    .filter(
      (s) =>
        !/(?:\bcron\.|\bnet\.|create schema cron|create schema net|insert into vault\.|create view vault\.decrypted_secrets)/i.test(
          s,
        ),
    );
  await db.query(safe.join("\n"));
  await db.query(`create schema vq_fixture;grant usage on schema vq_fixture to authenticated;
 create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text,name text);
 create function extensions.grant_pg_net_access() returns text language sql as $$select 'net.http_post'::text$$;
 create function vault.update_secret() returns text language sql as $$select 'vault.decrypted_secrets'::text$$;
 -- Model managed Supabase schema defaults; preparation must explicitly revoke them.
 alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
 alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;`);
  for (const u of snapshot.users)
    await db.query(
      `insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,case when $3 then now() end,$4)`,
      [u.id, u.email, u.email_confirmed, u.is_anonymous],
    );
  for (const m of snapshot.migrations)
    await db.query(
      "insert into supabase_migrations.schema_migrations values($1,$2)",
      [m.version, m.name],
    );
  for (const t of snapshot.tables) {
    await db.query(
      `create table ${t.name} (${t.columns.map((c) => q(c.name) + " " + c.type + (c.default ? " default " + c.default : "") + (c.notnull ? " not null" : "")).join(",")});alter table ${t.name} enable row level security;`,
    );
    for (const c of t.constraints ?? [])
      await db.query(
        `alter table ${t.name} add constraint ${q(c.name)} ${c.definition}`,
      );
    await db.query(
      `revoke all on ${t.name} from public,anon,authenticated,service_role;grant select on ${t.name} to authenticated;${t.name.startsWith("public.") ? "grant all on " + t.name + " to service_role;" : ""}${["public.games", "public.nba_games"].includes(t.name) ? "grant select on " + t.name + " to anon;" : ""}`,
    );
  }
  await db.query("set check_function_bodies=false");
  for (const f of observed.functions) await db.query(f.definition);
  await db.query("set check_function_bodies=true");
  for (const f of observed.functions) {
    const sig = f.signature;
    await db.query(
      `revoke all on function ${sig} from public,anon,authenticated,service_role;grant execute on function ${sig} to authenticated;${f.acl.includes("service_role=") ? "grant execute on function " + sig + " to service_role;" : ""}${f.acl.includes("anon=") ? "grant execute on function " + sig + " to anon;" : ""}`,
    );
  }
  for (const p of snapshot.policies)
    await db.query(
      `create policy ${q(p.policyname)} on ${p.schemaname}.${p.tablename} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""}`,
    );
  for (const t of snapshot.data)
    if (t.rows.length)
      await db.query(
        `insert into ${t.name} select * from jsonb_populate_recordset(null::${t.name},$1::jsonb)`,
        [JSON.stringify(t.rows)],
      );
  const assertions = await read(
    "scripts/operations/atlas-staging-catalog-assertions.sql",
  );
  const before = (await db.query(assertions)).rows;
  report.before = before;
  if (before.some((r) => r.phase !== "prepared" && r.result !== "PASS"))
    throw Error("Local reduced fixture differs from preserved baseline");
  const oldOid = (
    await db.query("select 'public.published_legs'::regclass::oid oid")
  ).rows[0].oid;
  // Exercise the exact transaction with only COMMIT changed to ROLLBACK.
  await db.query(sql.replace(/commit;\s*$/, "rollback;"));
  assert.equal(
    (await db.query("select to_regnamespace('private') n")).rows[0].n,
    null,
  );
  assert.equal(
    (await db.query("select 'public.published_legs'::regclass::oid oid"))
      .rows[0].oid,
    oldOid,
  );
  report.checks.push({
    name: "Full preparation rollback retains reduced fixture OID/data/grants and absent schemas",
    status: "PASS",
  });
  // Deliberate local-only fixture and RLS drift must fail before installation.
  for (const drift of [
    "update public.games set away_team='LOCAL_REHEARSAL_DRIFT'",
    "alter table public.games disable row level security",
  ]) {
    await db.query("begin");
    await db.query(drift);
    await assert.rejects(
      db.query(sql),
      /Staging catalog check failed|Unsafe isolated relation baseline/,
    );
    await db.query("rollback");
    assert.equal(
      (await db.query("select to_regnamespace('private') n")).rows[0].n,
      null,
    );
  }
  report.checks.push({
    name: "Changed fixture digest and disabled fixture RLS reject atomically",
    status: "PASS",
  });
  // Execute each SQL unit in the SAME transaction; print the precise failing unit on error.
  for (const [i, u] of splitSql(sql).entries())
    try {
      await db.query(u.sql);
    } catch (e) {
      report.failure_unit = i + 1;
      report.failure_sql = u.sql;
      throw e;
    }
  report.after = (await db.query(assertions)).rows;
  if (report.after.some((r) => r.result !== "PASS"))
    throw Error("Post-preparation catalog assertion failed");
  report.checks.push({
    name: "All Claude preservation/isolation/prepared assertions",
    status: "PASS",
    count: report.after.length,
  });
  assert.equal(
    (
      await db.query(
        "select 'vq_fixture.published_legs_preserved'::regclass::oid oid",
      )
    ).rows[0].oid,
    oldOid,
  );
  const adaptations = JSON.parse(
    await read("docs/atlas/schema-review/adaptations.json"),
  );
  report.adapted_definitions = [];
  for (const a of adaptations.proposed_functions) {
    const def = (
      await db.query(
        `select pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=$1`,
        [a.object],
      )
    ).rows;
    assert.equal(def.length, 1);
    assert.equal(hash(def[0].definition), a.proposed_sha256, a.object);
    report.adapted_definitions.push({
      object: a.object,
      sha256: hash(def[0].definition),
      expected_sha256: a.proposed_sha256,
      result: "PASS",
    });
  }
  report.checks.push({
    name: "C3 six installed adaptation definitions byte-identical to approved proposed_sha256",
    status: "PASS",
  });
  report.grants = (
    await db.query(`select n.nspname||'.'||p.proname name,p.oid::regprocedure::text signature,
 has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') service_role,
 has_function_privilege('anon',p.oid,'EXECUTE') anon,
 exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','vq_fixture','vq_private_access_stage') order by 1,2`)
  ).rows;
  report.rls_disabled = (
    await db.query(`select c.oid::regclass::text name,
 has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') authenticated_access,
 has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') anon_access
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private','vq_fixture','vq_private_access_stage') and c.relkind='r' and not c.relrowsecurity order by 1`)
  ).rows;
  assert(
    report.rls_disabled.every((r) => !r.authenticated_access && !r.anon_access),
  );
  report.checks.push({
    name: "C2 exact explicit authenticated/service_role grant checks embedded in preparation; full grants recorded",
    status: "PASS",
    functions: report.grants.length,
  });
  // C1: managed helpers carry forbidden markers and correctly do not fail the scan.
  const strict = await read(dir + "/post-preparation-assertions.sql");
  await db.query(strict);
  for (const marker of [
    "vegasquant.app",
    "net.http_post",
    "http_post",
    "vault.decrypted_secrets",
    "uowearboulykfcwnuirn",
  ]) {
    await db.query("begin");
    await db.query(
      `create function public.rehearsal_bad_marker() returns text language sql as $$select ${lit(marker)}::text$$`,
    );
    await assert.rejects(db.query(strict), /Outbound\/provider/);
    await db.query("rollback");
  }
  await db.query("begin");
  await db.query(
    "create function public.rehearsal_internet() returns text language sql as $$select 'internet.example'::text$$",
  );
  await db.query(strict);
  await db.query("rollback");
  report.checks.push({
    name: "C1 managed-code exemptions, word-boundary net regex, all five application markers rejected",
    status: "PASS",
  });
  await db.query("begin");
  await db.query(
    "create function private.rehearsal_future_default() returns boolean language sql as $$select true$$",
  );
  assert.equal(
    (
      await db.query(
        "select has_function_privilege('anon','private.rehearsal_future_default()','EXECUTE') ok",
      )
    ).rows[0].ok,
    false,
  );
  await db.query("rollback");
  report.checks.push({
    name: "Global/default PUBLIC EXECUTE denied for new private helper",
    status: "PASS",
  });
  const identitySql = await read(dir + "/identities.sql");
  report.identity_sha256 = hash(identitySql);
  await db.query(identitySql);
  report.after_identities = (await db.query(assertions)).rows;
  assert(report.after_identities.every((r) => r.result === "PASS"));
  const identities = JSON.parse(
    await read(dir + "/identity-map.json"),
  ).identities;
  const state = (
    await db.query(
      "select count(*)::int total,count(*) filter(where phone is not null or encrypted_password is not null)::int credentials from auth.users",
    )
  ).rows[0];
  assert.equal(state.total, 10);
  assert.equal(state.credentials, 0);
  report.checks.push({
    name: "C4 separate six-identity process: no password/phone/MFA/session/admin/publisher grants; all 10 preservation digests match",
    status: "PASS",
  });
  // All sessions and consumer content below are DISPOSABLE LOCAL ONLY and roll back.
  await db.query("begin");
  const author = snapshot.users[0].id;
  await db.query(
    "insert into public.ruby_contributors(user_id,brand,theme) values($1,'FranksCorner','corner')",
    [author],
  );
  await db.query(
    "insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,legs) values(gen_random_uuid(),$1,'FranksCorner','corner','NBA','LOCAL REHEARSAL ONLY','[\"Synthetic leg A\",\"Synthetic leg B\"]')",
    [author],
  );
  report.negative_controls = [];
  for (const [index, i] of identities.entries()) {
    const session = `00000000-0000-4000-8000-${String(8000 + index).padStart(12, "0")}`;
    await db.query(
      "insert into auth.sessions(id,user_id,aal,not_after) values($1,$2,'aal2',now()+interval '1 hour')",
      [session, i.id],
    );
    await db.query(
      "insert into public.saved_legs(user_id,leg_key) values($1,'local-rehearsal-only')",
      [i.id],
    );
    await db.query(
      "insert into public.notifications(recipient_id,actor_name,type,message,priority,deep_link,group_key) values($1,'LOCAL SYNTHETIC','account','LOCAL REHEARSAL ONLY','critical','/notifications','local-rehearsal-only')",
      [i.id],
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: i.id,
        session_id: session,
        aal: "aal2",
        role: "authenticated",
        is_anonymous: false,
      }),
    ]);
    await db.query("set local role authenticated");
    assert.equal(
      (await db.query("select vq_private_access_stage.authorized() ok")).rows[0]
        .ok,
      true,
      i.email + " same gate",
    );
    assert.equal(
      (await db.query("select private.has_membership() ok")).rows[0].ok,
      i.expected_member,
      i.email,
    );
    const saved = (await db.query("select * from public.saved_legs")).rows
      .length;
    const ruby = (await db.query("select * from public.ruby_cards")).rows
      .length;
    assert.equal(
      saved,
      i.expected_member ? 1 : 0,
      i.email + " direct saved table",
    );
    assert.equal(
      ruby,
      i.expected_member ? 1 : 0,
      i.email + " original invoker ruby view",
    );
    const catalog = (
      await db.query("select public.published_leg_catalog() result")
    ).rows[0].result;
    assert.deepEqual(
      catalog,
      [],
      i.email + " empty original published-leg RPC (positive content UNRUN)",
    );
    const inbox = (await db.query("select public.notification_inbox() result"))
      .rows[0].result;
    const count = (
      await db.query("select count(*)::int n from public.notifications")
    ).rows[0].n;
    assert.equal(
      count,
      i.expected_member ? 1 : 0,
      i.email + " own inbox source RLS",
    );
    assert.equal(
      inbox.items.length,
      i.expected_member ? 1 : 0,
      i.email + " actual inbox RPC",
    );
    await db.query("savepoint oracle");
    await assert.rejects(
      db.query("select private.age_eligible($1)", [author]),
      /permission denied/,
    );
    await db.query("rollback to savepoint oracle");
    report.negative_controls.push({
      email: i.email,
      gate: true,
      expected_member: i.expected_member,
      direct_saved_rows: saved,
      ruby_view_rows: ruby,
      published_leg_rpc: "EMPTY_EXECUTION_ONLY_POSITIVE_CONTENT_UNRUN",
      inbox_source_rows: count,
      inbox_rpc_items: inbox.items.length,
      age_oracle: "42501",
      result: "PASS",
    });
    if (i.expected_member) {
      for (const gateDrift of [
        "update auth.sessions set aal='aal1' where id=$1",
        "update auth.sessions set not_after=now()-interval '1 minute' where id=$1",
        "delete from auth.sessions where id=$1",
      ]) {
        await db.query("reset role");
        await db.query("savepoint session_drift");
        await db.query(gateDrift, [session]);
        await db.query("set local role authenticated");
        assert.equal(
          (await db.query("select private.has_membership() ok")).rows[0].ok,
          false,
        );
        assert.equal(
          (await db.query("select * from public.saved_legs")).rows.length,
          0,
        );
        await db.query("rollback to savepoint session_drift");
      }
    }
    await db.query("reset role");
  }
  await db.query("set local role anon");
  for (const query of [
    "select * from public.games",
    "select * from public.nba_games",
    "select * from public.saved_legs",
    "select * from public.published_legs",
    "select * from public.ruby_cards",
    "select public.published_leg_catalog()",
  ]) {
    await db.query("savepoint anonymous_denial");
    await assert.rejects(db.query(query), /permission denied/);
    await db.query("rollback to savepoint anonymous_denial");
  }
  await db.query("rollback");
  await db.query("select set_config('request.jwt.claims','{}',false)");
  assert.equal(
    (await db.query("select count(*)::int n from auth.sessions")).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from public.ruby_contributors"))
      .rows[0].n,
    0,
  );
  report.final = (await db.query(assertions)).rows;
  assert(report.final.every((r) => r.result === "PASS"));
  report.checks.push({
    name: "Six controls through real saved table, original ruby_cards view, published_leg_catalog RPC, inbox source, oracle ACL, real gate AAL/revocation/expiry, anonymous 42501; local content/sessions rolled back",
    status: "PASS",
  });
  report.unrun = [
    "Positive-content published_legs (source publication/model gates intentionally not bypassed)",
    "Full consumer contract/capability alignment and same-session website tests",
    "Hosted preparation, actual-target catalog review, real MFA/member sessions, protected hosting and owner rollback acceptance",
  ];
  report.status = "PASS";
} catch (e) {
  report.status = "FAIL";
  report.failure = e.message;
  console.error(e.message);
  if (report.failure_sql) console.error(report.failure_sql.slice(0, 2500));
  process.exitCode = 1;
  await db.query("rollback").catch(() => {});
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(
    output + "/rehearsal.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await db.end();
}
