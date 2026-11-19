import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
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

test("proposed hosted eligibility uses live gate and stored state, not fixture switches", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth;create schema vq_fixture;create schema vq_private_access_stage;
    grant usage on schema auth,vq_fixture,vq_private_access_stage to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('fixture.uid',true),'')::uuid$$;
    create function vq_private_access_stage.authorized() returns boolean language sql stable as $$select current_setting('fixture.gate',true)='on'$$;
    create function vq_fixture.allowed() returns boolean language sql stable as $$select current_setting('fixture.member',true)='on'$$;
    create table vq_fixture.age_states(user_id uuid,verified boolean);
    insert into vq_fixture.age_states values ('00000000-0000-4000-8000-000000000001',true),('00000000-0000-4000-8000-000000000002',true);
    revoke all on vq_fixture.age_states from public,anon,authenticated;
    select set_config('vq.review.target_ref','caynldluziwrzmvuslzg',false);
  `);
  const proposal = await readFile(
    "docs/atlas/schema-review/eligibility-adapters.sql.proposed",
    "utf8",
  );
  assert.doesNotMatch(proposal, /current_setting\('test\./);
  await db.exec(
    "select set_config('vq.review.target_ref','uowearboulykfcwnuirn',false)",
  );
  await assert.rejects(db.exec(proposal), /Review proposal requires/);
  await db.exec(
    "rollback;select set_config('vq.review.target_ref','caynldluziwrzmvuslzg',false)",
  );
  assert.equal(
    (await db.query<any>("select to_regnamespace('private') n")).rows[0].n,
    null,
  );
  await db.exec(proposal);
  await db.exec(
    `set role authenticated;select set_config('fixture.uid','00000000-0000-4000-8000-000000000001',false),set_config('fixture.gate','on',false),set_config('fixture.member','on',false)`,
  );
  const check = async () =>
    (
      await db.query<any>(
        "select private.has_membership() member,private.age_member_allowed() age,private.age_eligible('00000000-0000-4000-8000-000000000002') author",
      )
    ).rows[0];
  assert.deepEqual(await check(), { member: true, age: true, author: true });
  await assert.rejects(
    db.query("select * from vq_fixture.age_states"),
    /permission denied/,
  );
  await db.exec("select set_config('fixture.member','off',false)");
  assert.deepEqual(await check(), { member: false, age: true, author: true });
  await db.exec("select set_config('fixture.gate','off',false)");
  assert.deepEqual(await check(), { member: false, age: false, author: false });
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query(
      "select private.age_eligible('00000000-0000-4000-8000-000000000001')",
    ),
    /permission denied/,
  );
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
  assert.match(manifest.reviewer_status, /UNASSIGNED/);
  assert(
    manifest.roots.every(
      (r: { direct_declarations: unknown[] }) => r.direct_declarations.length,
    ),
  );
  assert(
    manifest.unresolved_source_names.includes(
      "private.before_age_has_membership",
    ),
  );
  assert.equal(
    manifest.roots.find(
      (r: { name: string }) => r.name === "public.published_legs",
    ).kind,
    "security_invoker_view",
  );
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
