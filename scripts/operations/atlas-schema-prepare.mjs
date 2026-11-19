/** Offline, deterministic preparation generator. NEVER connects or executes SQL. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { hash, describe } from "./atlas-schema-review.mjs";
export const TARGET = "caynldluziwrzmvuslzg";
export const DIRECTORY = "docs/atlas/schema-preparation";
const q = (s) => '"' + s.replaceAll('"', '""') + '"';
const lit = (s) => "'" + s.replaceAll("'", "''") + "'";
const full = (n) => (n.includes(".") ? n : "public." + n);
const refs = (s) => describe(s).references;
const read = async (p) => readFile(p, "utf8");
export async function generatePreparation(output = DIRECTORY) {
  const review = "docs/atlas/schema-review/";
  const catalogBytes = await readFile(DIRECTORY + "/replay-catalog.json.gz");
  if (
    hash(catalogBytes) !==
    (await read(DIRECTORY + "/replay-catalog.sha256")).trim()
  )
    throw Error("Replay catalog integrity mismatch");
  const catalog = JSON.parse(gunzipSync(catalogBytes));
  const adaptations = JSON.parse(await read(review + "adaptations.json"));
  const manifest = JSON.parse(await read(review + "manifest.json"));
  const exclusions = JSON.parse(
    await read(review + "outbound-exclusions.json"),
  );
  const snapshot = JSON.parse(
    await read(DIRECTORY + "/reduced-staging-snapshot.json"),
  );
  const fixtureNames = new Set(snapshot.tables.map((t) => t.name));
  const evidence = [];
  const funcs = catalog.functions.map((f) => ({
    ...f,
    name: full(f.name),
    signature: full(f.signature),
  }));
  const free = funcs.find((f) => f.name === "private.free_challenge_desk");
  const freeSql = `CREATE OR REPLACE FUNCTION private.free_challenge_desk()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 raise exception 'Anonymous/free consumer contracts are unavailable on isolated staging' using errcode='42501';
end
$function$
`;
  evidence.push({
    object: free.name,
    status: "NEW_ADAPTATION_REQUIRES_PREPARATION_HASH_REVIEW",
    original_sha256: hash(free.definition),
    proposed_sha256: hash(freeSql),
    proposed_sql: freeSql,
    reason:
      "Anonymous/free-core contracts are unavailable on isolated staging. Original free-core branch needs missing games.slot/created_at; deny that branch explicitly instead of altering fixture columns or weakening entitlement.",
  });
  free.definition = freeSql;
  free.body = freeSql;
  free.language = "plpgsql";
  free.definer = false;
  for (const a of adaptations.proposed_functions) {
    if (hash(a.proposed_sql) !== a.proposed_sha256)
      throw Error("Adaptation hash mismatch: " + a.object);
    const f = funcs.find((f) => f.name === a.object);
    if (!f) throw Error("Missing adapted object " + a.object);
    f.definition = a.proposed_sql;
    f.body = a.proposed_sql;
    evidence.push({
      object: a.object,
      sha256: a.proposed_sha256,
      source: "adaptations.json",
      exact_bytes: true,
    });
  }
  const replacement = new Set([
    "private.age_eligible",
    "private.age_member_allowed",
    "private.has_membership",
    "private.before_age_has_membership",
  ]);
  const baselineFunctions = new Set(
    JSON.parse(await read(review + "observed-staging.json")).functions.map(
      (f) => full(f.signature).split("(")[0],
    ),
  );
  const omitted = new Map();
  omitted.set(
    "private.zone_game_index",
    "Original view requires games.away_abbreviation/home_abbreviation absent from preserved reduced fixture. No fixture column/data rewrite; zone enrichment unavailable.",
  );
  omitted.set(
    "private.notification_deliveries",
    "External delivery queue excluded with provider chain",
  );
  omitted.set(
    "private.wants_publication",
    "Publication-delivery preference helper requires missing games abbreviations; delivery contracts excluded",
  );
  omitted.set(
    "public.nba_defense_vs_position",
    "Original SQL requires nba_games.season_type absent from preserved reduced fixture; research contract remains unavailable",
  );
  for (const n of [
    ...exclusions.outbound_functions.map((f) => f.name),
    ...exclusions.transitive_outbound_callers,
    ...exclusions.provider_chain_exclusions,
    ...adaptations.unavailable_dealer_functions,
    "private.is_dealer_publisher",
    "private.existing_member_premium",
  ])
    omitted.set(n, "Reviewed outbound/provider/Dealer exclusion");
  for (const f of funcs) {
    if (replacement.has(f.name)) continue;
    if (
      /vegasquant\.app|uowearboulykfcwnuirn|\bnet\.|http_post|vault\.decrypted_secrets|is_dealer_publisher|existing_member_premium/i.test(
        f.definition,
      )
    )
      omitted.set(f.name, "Forbidden source marker");
    if (
      /(?:push|dispatch|live_pick|claim_social|finish_social|retry_social|social_notification_delivery|social_notification_health|billing|checkout|age_verification|age_checkout|age_push|account_erasure|zone_auto|zone_dealer|password|send_email)/i.test(
        f.name,
      )
    )
      omitted.set(
        f.name,
        "Provider, identity lifecycle, Dealer or delivery operation excluded",
      );
  }
  const tables = catalog.tables.map((t) => ({ ...t, name: full(t.name) }));
  for (const t of tables)
    if (
      /(?:push|billing|age_checks|age_policy|zone_automation|dealer_attribution|existing_member_premium|frank_anniversary)/i.test(
        t.name,
      )
    )
      omitted.set(t.name, "Provider/account/config/Dealer store excluded");
  let change = true;
  while (change) {
    change = false;
    for (const f of funcs) {
      if (
        omitted.has(f.name) ||
        replacement.has(f.name) ||
        baselineFunctions.has(f.name)
      )
        continue;
      const bad = refs(f.definition).find(
        (n) => n !== f.name && omitted.has(n),
      );
      if (bad) {
        omitted.set(f.name, "Calls excluded " + bad);
        change = true;
      }
    }
  }
  const selected = new Set(
    manifest.dependency_names.filter((n) => !omitted.has(n)),
  );
  // Add only actual FK/trigger/default/policy/function dependencies, never adjacent seeds or jobs.
  change = true;
  while (change) {
    change = false;
    for (const o of [...tables, ...funcs]) {
      if (!selected.has(o.name)) continue;
      const text =
        o.definition ??
        JSON.stringify({
          columns: o.columns,
          constraints: o.constraints,
          policies: o.policies,
          triggers: (o.triggers ?? []).filter((t) => !omitted.has(t.function)),
        });
      for (const n of refs(text))
        if (!omitted.has(n) && !selected.has(n)) {
          selected.add(n);
          change = true;
        }
    }
  }
  const chosenTables = tables.filter(
    (t) =>
      selected.has(t.name) && !fixtureNames.has(t.name) && !omitted.has(t.name),
  );
  const chosenFunctions = funcs.filter(
    (f) =>
      selected.has(f.name) &&
      !omitted.has(f.name) &&
      !replacement.has(f.name) &&
      !baselineFunctions.has(f.name),
  );
  const chosenViews = catalog.views
    .map((v) => ({ ...v, name: full(v.name) }))
    .filter((v) => selected.has(v.name) && !omitted.has(v.name));
  const parts = [];
  const add = (s) => parts.push(s.trimEnd());
  let asserts = await read(review + "post-preparation-assertions.sql.proposed");
  asserts = asserts
    .replace(
      "from pg_proc p where",
      `from pg_proc p join pg_namespace n on n.oid=p.pronamespace\n where n.nspname not in ('pg_catalog','information_schema','extensions','vault','pgsodium','realtime','storage','auth','net','cron','pgbouncer')\n and n.nspname !~ '^(graphql|supabase_|pg_toast|pg_temp)' and (`,
    )
    .replace("like '%net.%'", "~ '\\mnet\\.'")
    .replace(
      "like '%vault.decrypted_secrets%';",
      "like '%vault.decrypted_secrets%' or lower(p.prosrc) like '%uowearboulykfcwnuirn%');",
    )
    .replace(
      "('pg_net','pg_cron','http')",
      "('pg_net','pg_cron','http','dblink','postgres_fdw')",
    );
  const applicationScope = `n.nspname not in ('pg_catalog','information_schema','extensions','vault','pgsodium','realtime','storage','auth','net','cron','pgbouncer') and n.nspname !~ '^(graphql|supabase_|pg_toast|pg_temp)'`;
  asserts = asserts.replace(
    "select 1 from pg_proc where prosrc like '%is_dealer_publisher%' or prosrc like '%existing_member_premium%')",
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where ${applicationScope} and (prosrc like '%is_dealer_publisher%' or prosrc like '%existing_member_premium%'))`,
  );
  asserts = asserts.replace(
    "end $verify_staging$;",
    `if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','p') and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))) then raise exception 'Anonymous public data access remains';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('private','vq_private_access_stage') and c.relkind='r' and not c.relrowsecurity and (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE') or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))) then raise exception 'RLS-disabled store exposed to caller';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where case when n.nspname in ('public','private') and c.relkind='S' then has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') else false end) then raise exception 'Anonymous sequence access remains';end if;
end $verify_staging$;`,
  );
  const catalogChecks = await read(
    "scripts/operations/atlas-staging-catalog-assertions.sql",
  );
  const checkQuery = catalogChecks
    .slice(catalogChecks.indexOf("\nwith\n") + 1)
    .trim()
    .replace(/;\s*$/, "");
  const checked = (phase) =>
    `do $catalog_checks$ declare atlas_check record;begin for atlas_check in ${checkQuery} loop\n if ${phase === "before" ? "atlas_check.phase <> 'prepared' and " : ""}atlas_check.result<>'PASS' then raise exception 'Staging catalog check failed: % / % / %',atlas_check.phase,atlas_check.name,atlas_check.detail;end if;end loop;end $catalog_checks$;`;
  const preflight = await read(
    "scripts/operations/private-access-stage-preflight.sql",
  );
  const pin = `do $target$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('vq.review.target_ref',true) is distinct from '${TARGET}' then raise exception 'Pinned staging executor required';end if;
 if to_regnamespace('private') is not null or to_regnamespace('vq_private_access_stage') is not null then raise exception 'Preparation is single-use; refusing existing schemas';end if;
 if (select count(*) from supabase_migrations.schema_migrations where (version,name) in (('20261115172210','consumer_phase1_synthetic_contract_fixture'),('20261115173820','consumer_phase1_synthetic_age_shell')))<>2 then raise exception 'Reduced staging migration identity mismatch';end if;
 if (select count(*) from auth.users)<>4 or exists(select 1 from auth.sessions) then raise exception 'Unexpected identity/session baseline';end if;
 end $target$;`;
  add(`-- GENERATED from replay-catalog + bf1c08a adaptations. REVIEW HASH BEFORE EXECUTION.
-- ONLY project ${TARGET}. GUC is an assertion, not connection provenance.
-- Executor MUST use the connector's literal project_id, verify this file's SHA256,
-- and have Claude's sign-off for that exact hash. No production target accepted.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
set local search_path=pg_catalog,public;
set local vq.review.target_ref='${TARGET}';
select pg_advisory_xact_lock(hashtextextended('atlas-staging-preparation-v1',0));
${pin}
${preflight}
${checked("before")}`);
  // Lock every preserved relation so checks and movement cannot race fixture writes.
  add(
    "lock table " +
      [...fixtureNames].sort().join(",") +
      " in access exclusive mode;",
  );
  add(preflight);
  add(checked("before"));
  add(`create temporary table atlas_preservation_before on commit drop as
 select '${TARGET}'::text target, 'public.published_legs'::regclass::oid archive_oid;`);
  add(`create schema vq_private_access_stage;
 revoke all on schema vq_private_access_stage from public,anon,authenticated,service_role;
 grant usage on schema vq_private_access_stage to authenticated;`);
  add(
    (
      await read("scripts/operations/private-development-policy.sql")
    ).replaceAll("private.", "vq_private_access_stage."),
  );
  add(await read("scripts/operations/private-access-stage-surfaces.sql"));
  // The Dealer source, helper, seed and feed are deliberately absent.
  let eligibility = await read(review + "eligibility-adapters.sql.proposed");
  eligibility = eligibility.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
  add(eligibility);
  add(`alter table public.published_legs set schema vq_fixture;
 alter table vq_fixture.published_legs rename to published_legs_preserved;
 revoke all on vq_fixture.published_legs_preserved from public,anon,authenticated,service_role;`);
  for (const name of fixtureNames)
    if (name !== "public.published_legs")
      add(`revoke all on ${name} from public,anon;`);
  const usedSequences = catalog.sequences.filter((s) =>
    chosenTables.some((t) => JSON.stringify(t.columns).includes(s.name)),
  );
  for (const s of usedSequences)
    add(
      `create sequence ${s.name} as ${s.type} increment by ${s.increment_by} minvalue ${s.min_value} maxvalue ${s.max_value} start ${s.start_value} ${s.cycle ? "cycle" : "no cycle"};`,
    );
  for (const f of chosenFunctions.filter((f) =>
    chosenTables.some((t) =>
      t.columns.some(
        (c) => c.generated && c.default.includes(f.name.split(".")[1] + "("),
      ),
    ),
  )) {
    add(f.definition + ";");
    add(
      `revoke all on function ${f.signature} from public,anon,authenticated,service_role;`,
    );
  }
  for (const t of chosenTables) {
    add(
      `create table ${t.name} (\n${t.columns.map((c) => " " + q(c.name) + " " + c.type + (c.identity ? " generated " + (c.identity === "a" ? "always" : "by default") + " as identity" : c.generated ? " generated always as (" + c.default + ") stored" : c.default ? " default " + c.default : "") + (c.notnull ? " not null" : "")).join(",\n")}\n);`,
    );
    add(`revoke all on ${t.name} from public,anon,authenticated,service_role;`);
  }
  // PL/pgSQL forward references and SQL wrapper ordering exist in the original graph.
  // This does NOT replace missing objects: all selected references are inventoried;
  // runtime probes and explicit unavailable contracts remain required.
  add("set local check_function_bodies=false;");
  for (const f of chosenFunctions) {
    add(f.definition + ";");
    add(
      `revoke all on function ${f.signature} from public,anon,authenticated,service_role;`,
    );
  }
  for (const v of chosenViews)
    add(
      `create view ${v.name} with (security_invoker=true) as\n${v.definition.replace(/;\s*$/, "")};\nrevoke all on ${v.name} from public,anon,authenticated,service_role;\ngrant select on ${v.name} to authenticated,service_role;`,
    );
  add("set local check_function_bodies=true;");
  // Forward-reference relaxation ends here: every SQL-language body must now compile.
  for (const f of chosenFunctions.filter((f) => f.language === "sql"))
    add(f.definition + ";");
  for (const fk of [false, true])
    for (const t of chosenTables)
      for (const c of t.constraints ?? [])
        if ((c.kind === "f") === fk)
          add(
            `alter table ${t.name} add constraint ${q(c.name)} ${c.definition};`,
          );
  for (const t of chosenTables)
    for (const idx of t.indexes ?? []) add(idx + ";");
  const grants = [];
  for (const f of chosenFunctions) {
    const roles = [
      ...new Set(
        (f.grants ?? [])
          .filter(
            (g) =>
              ["authenticated", "service_role"].includes(g.role) &&
              g.privilege === "EXECUTE",
          )
          .map((g) => g.role),
      ),
    ].sort();
    if (roles.length)
      add(`grant execute on function ${f.signature} to ${roles.join(",")};`);
    grants.push({
      signature: f.signature,
      roles,
      source_sha256: hash(f.definition),
    });
  }
  for (const t of chosenTables) {
    // Public source RLS must be preserved, never replaced with a synthetic TRUE policy.
    // Private stores with RLS off remain inaccessible by caller roles.
    if (t.rls || t.name.startsWith("public."))
      add(`alter table ${t.name} enable row level security;`);
    for (const p of t.policies ?? []) {
      const text = JSON.stringify(p);
      if (refs(text).some((n) => omitted.has(n))) {
        evidence.push({
          object: t.name + " policy " + p.policyname,
          status: "OMITTED",
          reason:
            "references excluded operation; no replacement permissive policy",
        });
        continue;
      }
      const roles = p.roles.filter((r) => r !== "anon" && r !== "public");
      if (!roles.length) continue;
      add(
        `create policy ${q(p.policyname)} on ${t.name} as ${p.permissive} for ${p.cmd} to ${roles.map(q).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""};`,
      );
    }
    for (const role of ["authenticated", "service_role"]) {
      const privileges = [
        ...new Set(
          (t.grants ?? [])
            .filter(
              (g) =>
                g.role === role &&
                ["SELECT", "INSERT", "UPDATE", "DELETE"].includes(g.privilege),
            )
            .map((g) => g.privilege),
        ),
      ];
      if (
        role === "authenticated" &&
        !t.rls &&
        t.name.startsWith("private.") &&
        privileges.length
      )
        throw Error("RLS-disabled private caller grant: " + t.name);
      if (privileges.length)
        add(`grant ${privileges.join(",")} on ${t.name} to ${role};`);
    }
    for (const tr of t.triggers ?? []) {
      if (omitted.has(tr.function)) {
        evidence.push({
          object: t.name + " trigger " + tr.name,
          status: "OMITTED",
          reason: omitted.get(tr.function),
        });
        continue;
      }
      add(tr.definition + ";");
    }
  }
  // Synthetic source snapshots stay intact, with additional member/gate restrictions.
  for (const name of [
    ...chosenTables.map((t) => t.name),
    ...fixtureNames,
  ].filter(
    (n) =>
      n !== "public.published_legs" &&
      !n.startsWith("vq_fixture.age_states") &&
      !n.startsWith("vq_fixture.entitlements"),
  )) {
    if (
      name.startsWith("private.") &&
      !chosenTables.find((t) => t.name === name).rls
    )
      continue;
    add(
      `create policy atlas_preparation_gate on ${name} as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));`,
    );
  }
  add(`do $external_delivery$ begin
 if to_regclass('public.notification_preferences') is not null then
 alter table public.notification_preferences alter column push_enabled set default false;
 alter table public.notification_preferences alter column email_enabled set default false;
 alter table public.notification_preferences add constraint atlas_no_external_delivery check(not push_enabled and not email_enabled);
 end if;end $external_delivery$;`);
  for (const s of usedSequences)
    add(
      `revoke all on sequence ${s.name} from public,anon,authenticated,service_role;`,
    );
  // Table writes requiring sequences must get only their exact source-owned sequence.
  for (const s of usedSequences) {
    const t = chosenTables.find((t) =>
      JSON.stringify(t.columns).includes(s.name),
    );
    for (const role of ["authenticated", "service_role"])
      if (t.grants?.some((g) => g.role === role && g.privilege === "INSERT"))
        add(`grant usage on sequence ${s.name} to ${role};`);
  }
  for (const t of chosenTables)
    for (const c of t.columns.filter((c) => c.identity)) {
      const roles = ["authenticated", "service_role"].filter((role) =>
        t.grants?.some((g) => g.role === role && g.privilege === "INSERT"),
      );
      add(
        `do $identity_sequence$ declare s text;begin s:=pg_get_serial_sequence(${lit(t.name)},${lit(c.name)});if s is null then raise exception 'Missing generated identity sequence';end if;execute format('revoke all on sequence %s from public,anon,authenticated,service_role',s);${roles.length ? `execute format('grant usage on sequence %s to ${roles.join(",")}',s);` : ""}end $identity_sequence$;`,
      );
    }
  // Original baseline function grants also become explicit (C2); anonymous is unavailable.
  const baselineGrants = [];
  for (const f of JSON.parse(await read(review + "observed-staging.json"))
    .functions) {
    const sig = full(f.signature);
    const roles = [
      "authenticated",
      ...(f.acl.includes("service_role=") ? ["service_role"] : []),
    ];
    add(
      `revoke all on function ${sig} from public,anon,authenticated,service_role;\ngrant execute on function ${sig} to ${roles.join(",")};`,
    );
    baselineGrants.push({ signature: sig, roles });
  }
  add(asserts);
  add(
    `do $archive$ begin if (select archive_oid from atlas_preservation_before) is distinct from 'vq_fixture.published_legs_preserved'::regclass::oid then raise exception 'Archive OID changed';end if;end $archive$;`,
  );
  add(checked("after"));
  const expectedAcl = [
    ...grants,
    ...baselineGrants,
    ...[
      "vq_private_access_stage.private_development_allowed()",
      "vq_private_access_stage.authorized()",
      "public.vq_private_access_stage_authorized()",
      "public.vq_private_access_stage_read()",
    ].map((signature) => ({ signature, roles: ["authenticated"] })),
    { signature: "private.has_membership()", roles: ["authenticated"] },
    { signature: "private.age_member_allowed()", roles: ["authenticated"] },
    { signature: "private.age_eligible(uuid)", roles: [] },
    { signature: "private.before_age_has_membership()", roles: [] },
  ];
  add(
    `do $explicit_grants$ declare f jsonb;r text;actual boolean;begin for f in select * from jsonb_array_elements(${lit(JSON.stringify(expectedAcl))}::jsonb) loop foreach r in array array['authenticated','service_role'] loop actual:=has_function_privilege(r,(f->>'signature')::regprocedure,'EXECUTE');if actual is distinct from (f->'roles' ? r) then raise exception 'Unexpected function grant: % %',f->>'signature',r;end if;end loop;end loop;end $explicit_grants$;`,
  );
  add(`-- No identity/session inserts in this artifact. No registry/capability activation.
commit;`);
  const sql = parts.join("\n\n") + "\n";
  await mkdir(output, { recursive: true });
  await writeFile(output + "/prepare.sql", sql);
  await writeFile(output + "/post-preparation-assertions.sql", asserts);
  const objectInventory = {
    status: "AWAITING_CLAUDE_EXACT_HASH_SIGNOFF",
    target_project: TARGET,
    approved_review_package: "bf1c08ad734a1f0e6f73d3bb4b07d0b40290dee3",
    source_ref: catalog.source_ref,
    replay_catalog_sha256: hash(catalogBytes),
    preparation_sha256: hash(sql),
    tables: chosenTables.map((t) => ({
      name: t.name,
      source_rls: t.rls,
      staged_rls: t.rls || t.name.startsWith("public."),
    })),
    views: chosenViews.map((v) => ({
      name: v.name,
      source_sha256: hash(v.definition),
    })),
    functions: grants,
    explicit_function_grants: expectedAcl,
    gate_tables: [
      "vq_private_access_stage.private_development_settings",
      "vq_private_access_stage.private_development_owners",
      "vq_private_access_stage.entitlements",
      "public.vq_private_access_stage_records",
    ],
    adaptations: evidence,
    omitted: [...omitted]
      .sort()
      .map(([object, reason]) => ({ object, reason })),
    sequences: usedSequences.map((s) => s.name),
    identity_creation: "SEPARATE_ARTIFACT_NO_SESSIONS",
    capability_activation:
      "NOT_PERFORMED; actual target catalog review and registry equivalence remain required",
  };
  await writeFile(
    output + "/inventory.json",
    JSON.stringify(objectInventory, null, 2) + "\n",
  );
  await writeFile(output + "/prepare.sha256", hash(sql) + "  prepare.sql\n");
  const identities = JSON.parse(await read(DIRECTORY + "/identity-map.json"));
  if (
    identities.target !== TARGET ||
    identities.identities.length !== 6 ||
    identities.identities.some((i) => !i.email.endsWith("@vq-fixture.invalid"))
  )
    throw Error("Unapproved identity target/domain/count");
  const bound = (value, kind) =>
    value === null
      ? "null"
      : value === "past"
        ? "transaction_timestamp()-interval '1 hour'"
        : kind === "starts_at"
          ? "transaction_timestamp()+interval '1 hour'"
          : "transaction_timestamp()+interval '24 hours'";
  const identitySql = `-- SEPARATE PROCESS ARTIFACT: requires Claude's review, plus Mike's recorded six-identity approval.
-- Inert synthetic Auth rows ONLY; no password, identity-provider credential, phone,
-- MFA enrollment, session, email/SMS, admin, Dealer or contributor assignment.
-- These rows are NOT login-ready. Real sessions need later isolation acceptance.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
set local search_path=pg_catalog,public;
set local vq.review.target_ref='${TARGET}';
do $identities$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('vq.review.target_ref',true) is distinct from '${TARGET}'
 or to_regprocedure('private.has_membership()') is null or to_regclass('vq_fixture.published_legs_preserved') is null
 or (select count(*) from auth.users)<>4 or exists(select 1 from auth.sessions)
 or exists(select 1 from vq_private_access_stage.private_development_owners)
 or exists(select 1 from vq_private_access_stage.entitlements)
 then raise exception 'Reviewed prepared target and unchanged identity baseline required';end if;
end $identities$;
lock table auth.users,vq_fixture.age_states,vq_fixture.entitlements,vq_private_access_stage.private_development_owners,vq_private_access_stage.entitlements in share row exclusive mode;
${checked("after")}
${identities.identities
  .map(
    (
      i,
    ) => `insert into auth.users(id,email,email_confirmed_at,aud,role,is_anonymous,raw_app_meta_data,raw_user_meta_data)
 values(${lit(i.id)}::uuid,${lit(i.email)},transaction_timestamp(),'authenticated','authenticated',false,'{}','{}');
insert into vq_fixture.age_states(user_id,verified) values(${lit(i.id)},${i.verified});
insert into vq_fixture.entitlements(user_id,allowed,starts_at,expires_at,revoked_at)
 values(${lit(i.id)},${i.allowed},${bound(i.starts_at, "starts_at")},${bound(i.expires_at, "expires_at")},${bound(i.revoked_at, "revoked_at")});
insert into vq_private_access_stage.private_development_owners(user_id) values(${lit(i.id)});
insert into vq_private_access_stage.entitlements(user_id,active) values(${lit(i.id)},true);`,
  )
  .join("\n")}
${checked("after")}
do $no_privilege$ begin
 if exists(select 1 from private.admin_users) or exists(select 1 from public.ruby_contributors) then raise exception 'Identity process cannot confer privileged membership';end if;
 if (select count(*) from auth.users)<>10 or exists(select 1 from auth.sessions) then raise exception 'Unexpected post-identity state';end if;
end $no_privilege$;
commit;
`;
  await writeFile(output + "/identities.sql", identitySql);
  await writeFile(
    output + "/identities.sha256",
    hash(identitySql) + "  identities.sql\n",
  );
  return objectInventory;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const i = process.argv.indexOf("--out");
  const x = await generatePreparation(i < 0 ? DIRECTORY : process.argv[i + 1]);
  console.log(
    JSON.stringify({
      sha256: x.preparation_sha256,
      tables: x.tables.length,
      functions: x.functions.length,
      views: x.views.length,
      omitted: x.omitted.length,
    }),
  );
}
