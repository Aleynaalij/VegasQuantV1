import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("review evidence preserves dollar bodies/quoted semicolons and catches adjacent dispatch", async () => {
  const { splitSql, describe, dependencyClosure } = await import(
    "../scripts/operations/atlas-schema-review.mjs"
  );
  const source = `-- ; comment\ncreate function public.reader() returns void language plpgsql as $body$begin perform private.helper('a;''b'); end$body$; /* nested /* ; */ comment */ select cron.schedule('job','10 seconds','select net.http_post()');`;
  const units = splitSql(source).map((x) => ({ ...x, ...describe(x.sql) }));
  assert.equal(units.length, 2);
  assert.deepEqual(units[0].subjects, ["public.reader"]);
  assert(units[0].references.includes("private.helper"));
  assert(units[1].risk_tags.includes("scheduler"));
  assert(units[1].risk_tags.includes("outbound_or_dispatch"));
  assert.throws(() => splitSql("do $$begin;"), /Unterminated/);
  const closure = dependencyClosure(
    [
      ...units,
      {
        ...describe(
          "create function private.helper() returns int as $$select 1$$ language sql;",
        ),
        sql: "helper",
      },
      {
        ...describe("create table public.unrelated(id int);"),
        sql: "unrelated",
      },
    ],
    ["public.reader"],
  );
  assert.equal(closure.units.length, 2);
  assert(!closure.units.some((u) => u.sql.includes("cron.schedule")));
});

test("proposed eligibility denies unverified, revoked and expired identities through table/view/RPC", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const id = (n: number) =>
    `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema vq_fixture;create schema vq_private_access_stage;
    grant usage on schema auth,vq_fixture,vq_private_access_stage to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
    create function vq_private_access_stage.authorized() returns boolean language sql stable as $$select current_setting('fixture.gate',true)='on'$$;
    create table vq_fixture.entitlements(user_id uuid primary key,allowed boolean);
    alter table vq_fixture.entitlements enable row level security;
    grant select on vq_fixture.entitlements to authenticated;
    create policy self on vq_fixture.entitlements for select to authenticated using(user_id=auth.uid());
    create function vq_fixture.allowed() returns boolean language sql stable as $$select coalesce((select allowed from vq_fixture.entitlements where user_id=auth.uid()),false)$$;
    create table vq_fixture.age_states(user_id uuid,verified boolean);
    insert into vq_fixture.age_states select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,n<>3 from generate_series(1,6)n;
    insert into vq_fixture.entitlements select user_id,user_id<>'${id(2)}' from vq_fixture.age_states;
    revoke all on vq_fixture.age_states from public,anon,authenticated;
    select set_config('vq.review.target_ref','uowearboulykfcwnuirn',false);
  `);
  const proposal = await readFile(
    "docs/atlas/schema-review/eligibility-adapters.sql.proposed",
    "utf8",
  );
  await assert.rejects(db.exec(proposal), /Review proposal requires/);
  await db.exec(
    "rollback;select set_config('vq.review.target_ref','caynldluziwrzmvuslzg',false)",
  );
  await db.exec(proposal);
  await db.exec(`update vq_fixture.entitlements set revoked_at=now() where user_id='${id(4)}';
    update vq_fixture.entitlements set expires_at=now()-interval '1 minute' where user_id='${id(5)}';
    update vq_fixture.entitlements set starts_at=now()+interval '1 hour' where user_id='${id(6)}';
    create table public.review_protected(id int);insert into public.review_protected values(1);
    alter table public.review_protected enable row level security;
    grant select on public.review_protected to authenticated;
    create policy eligible on public.review_protected for select to authenticated using(private.has_membership());
    create view public.review_view with(security_invoker=true) as select * from public.review_protected;
    grant select on public.review_view to authenticated;
    create function public.review_rpc() returns jsonb language sql security invoker as $$select coalesce(jsonb_agg(t),'[]') from public.review_protected t$$;
    revoke all on function public.review_rpc() from public;grant execute on function public.review_rpc() to authenticated;
    create function private.review_future_helper() returns boolean language sql as $$select true$$;
    select set_config('fixture.gate','on',false);
  `);
  assert.equal(
    (
      await db.query<any>(
        "select has_function_privilege('authenticated','private.age_eligible(uuid)','EXECUTE') ok",
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<any>(
        "select has_function_privilege('anon','private.review_future_helper()','EXECUTE') ok",
      )
    ).rows[0].ok,
    false,
  );
  assert.equal(
    (
      await db.query<any>(
        "select prosecdef,proowner='postgres'::regrole owner from pg_proc where oid='private.age_member_allowed()'::regprocedure",
      )
    ).rows[0].prosecdef,
    true,
  );
  for (let who = 1; who <= 6; who++) {
    await db.exec(
      `reset role;set role authenticated;select set_config('fixture.uid','${id(who)}',false)`,
    );
    const row = (await db.query<any>("select private.has_membership() member"))
      .rows[0];
    assert.equal(row.member, who === 1, `identity ${who} membership`);
    assert.equal(
      (await db.query("select * from public.review_protected")).rows.length,
      who === 1 ? 1 : 0,
      `identity ${who} direct table`,
    );
    assert.equal(
      (await db.query("select * from public.review_view")).rows.length,
      who === 1 ? 1 : 0,
      `identity ${who} invoker view`,
    );
    assert.equal(
      (await db.query<any>("select public.review_rpc() r")).rows[0].r.length,
      who === 1 ? 1 : 0,
      `identity ${who} invoker RPC`,
    );
    await assert.rejects(
      db.query(`select private.age_eligible('${id(2)}')`),
      /permission denied/,
    );
  }
  await db.exec(
    `select set_config('fixture.uid','${id(1)}',false),set_config('fixture.gate','off',false)`,
  );
  assert.equal(
    (await db.query<any>("select private.has_membership() ok")).rows[0].ok,
    false,
  );
  await db.exec("reset role;set role anon");
  for (const sql of [
    "select * from public.review_protected",
    "select * from public.review_view",
    "select public.review_rpc()",
  ])
    await assert.rejects(db.query(sql), /permission denied/);
});

test("source package is reproducible and retains risky history without approving a catalog", async (t) => {
  const { buildReview } = await import(
    "../scripts/operations/atlas-schema-review.mjs"
  );
  const folder = await mkdtemp(join(tmpdir(), "atlas-review-"));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const first = await buildReview(folder),
    second = await buildReview(folder);
  assert.deepEqual(first, second);
  const manifest = JSON.parse(
    await readFile(join(folder, "manifest.json"), "utf8"),
  );
  assert.equal(manifest.catalog_status, "NO_REVIEWED_CATALOG_CREATED");
  assert.match(manifest.reviewer_status, /Claude/);
  assert(
    manifest.roots.every(
      (r: { direct_declarations: unknown[] }) => r.direct_declarations.length,
    ),
  );
  assert(
    manifest.lexical_unresolved_source_names.includes(
      "private.before_age_has_membership",
    ),
  );
  assert.equal(
    manifest.roots.find(
      (r: { name: string }) => r.name === "public.published_legs",
    ).kind,
    "security_invoker_view",
  );
  assert.deepEqual(manifest.unresolved_source_names, []);
  assert.equal(manifest.effective_definition_evidence.functions.length, 5);
  assert.equal(manifest.effective_definition_evidence.views.length, 2);
  const firstIndex = await readFile(join(folder, "review-index.md"), "utf8");
  assert.match(firstIndex, /public.published_legs/);
  const original = JSON.parse(
    gunzipSync(
      await readFile(join(folder, "original-statements.json.gz")),
    ).toString("utf8"),
  );
  const adjacent = JSON.parse(
    gunzipSync(
      await readFile(join(folder, "adjacent-risk-statements.json.gz")),
    ).toString("utf8"),
  );
  const statements = [...original.statements, ...adjacent.statements];
  assert(
    statements.some((s) =>
      s.sql.includes("cron.schedule('vq-social-notifications'"),
    ),
  );
  assert(
    statements.some(
      (s) =>
        s.sql.includes(
          "https://vegasquant.app/api/notifications/social-dispatch",
        ) && s.risk_tags.includes("outbound_or_dispatch"),
    ),
  );
});

test("post-preparation assertions reject residual outbound code, vault rows and PUBLIC private execute", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role authenticated;create schema vault;create table vault.secrets(secret text);create schema private;alter default privileges in schema private revoke execute on functions from public",
  );
  const sql = await readFile(
    "docs/atlas/schema-review/post-preparation-assertions.sql.proposed",
    "utf8",
  );
  await db.exec(sql);
  for (const marker of [
    "vegasquant.app",
    "net.",
    "http_post",
    "vault.decrypted_secrets",
  ]) {
    await db.exec(
      `create function public.review_bad() returns text language sql as $$select '${marker}'::text$$`,
    );
    await assert.rejects(db.exec(sql), /Outbound\/provider/);
    await db.exec("drop function public.review_bad()");
  }
  await db.exec("insert into vault.secrets values('synthetic-test-only')");
  await assert.rejects(db.exec(sql), /vault must be empty/);
  await db.exec("delete from vault.secrets");
  await db.exec(
    "create function private.review_bad_acl() returns boolean language sql as $$select true$$;grant execute on function private.review_bad_acl() to public",
  );
  await assert.rejects(db.exec(sql), /PUBLIC execute/);
  await db.exec(
    "revoke execute on function private.review_bad_acl() from public",
  );
  await db.exec(sql);
});

test("native replay evidence covers every pinned migration/baseline and selected effective objects", async () => {
  const root = "docs/atlas/schema-review/";
  const digest = (value: string | Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const inputs = JSON.parse(
    await readFile(root + "source-inputs.json", "utf8"),
  );
  const sources: Record<string, string> = {};
  for (const chunk of inputs.chunks) {
    const bytes = await readFile(root + chunk.filename);
    assert.equal(digest(bytes), chunk.sha256);
    Object.assign(sources, JSON.parse(gunzipSync(bytes).toString("utf8")));
  }
  const report = JSON.parse(
    await readFile(root + "local-replay/replay-report.json", "utf8"),
  );
  assert.equal(report.status, "PASS");
  assert.match(report.engine, /PostgreSQL 17[.]11 /);
  assert.equal(
    report.platform_sha256,
    digest(await readFile(root + "local-replay-platform.sql")),
  );
  const expected = Object.keys(sources)
    .filter(
      (p) =>
        p.startsWith("supabase/migrations/") ||
        p.startsWith("supabase/schema/"),
    )
    .sort();
  assert.deepEqual(
    report.migrations.map((m: { path: string }) => m.path).sort(),
    expected,
  );
  for (const migration of report.migrations)
    assert.equal(migration.sha256, digest(sources[migration.path]));
  assert.equal(report.effective_coverage.migration_files, 187);
  assert.equal(report.effective_coverage.baseline_files, 3);
  const effective = JSON.parse(
    await readFile(root + "local-replay/effective-definitions.json", "utf8"),
  );
  assert.equal(effective.definitions.length, 5);
  assert.equal(effective.views.length, 2);
  for (const object of [...effective.definitions, ...effective.views])
    assert.equal(object.sha256, digest(object.definition));
  for (const view of effective.views)
    assert(view.options.includes("security_invoker=true"));
  const adaptations = JSON.parse(
    await readFile(root + "adaptations.json", "utf8"),
  );
  for (const proposal of adaptations.proposed_functions) {
    assert.equal(proposal.proposed_sha256, digest(proposal.proposed_sql));
    assert.doesNotMatch(proposal.proposed_sql, /is_dealer_publisher/);
  }
  const outbound = JSON.parse(
    await readFile(root + "local-replay/outbound-functions.json", "utf8"),
  );
  assert.deepEqual(
    outbound.kalshi_pause_triggers.map((t: { tgname: string }) => t.tgname),
    ["kalshi_revision_pause", "kalshi_submission_pause"],
  );
  for (const name of [
    "private.invoke_push_dispatcher",
    "private.invoke_live_pick_alerts",
  ])
    assert(outbound.functions.some((f: { name: string }) => f.name === name));
});
