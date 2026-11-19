// Native PostgreSQL 17 replay: fixed loopback only, never a Supabase connection.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { splitSql, SOURCE_REF } from "./atlas-schema-review.mjs";
const hash = (x) => createHash("sha256").update(x).digest("hex");
const output = process.argv[process.argv.indexOf("--out") + 1];
if (!process.argv.includes("--out") || !output)
  throw Error("Use --out DIRECTORY");
if (!process.env.ATLAS_REPLAY_PG_MODULE)
  throw Error(
    "Set ATLAS_REPLAY_PG_MODULE to the locally installed pg driver path",
  );
const { default: pg } = await import(
  pathToFileURL(process.env.ATLAS_REPLAY_PG_MODULE)
);
const client = new pg.Client({
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  database: "atlas_schema_replay",
  password: undefined,
});
await client.connect();
const location = (
  await client.query("select host(inet_server_addr()) host,version() version")
).rows[0];
if (
  location.host !== "127.0.0.1" ||
  !location.version.startsWith("PostgreSQL 17.")
)
  throw Error("Unexpected replay endpoint");
if ((await client.query("select to_regnamespace('auth') n")).rows[0].n)
  throw Error("Replay requires an empty disposable database");
const report = {
  source_ref: SOURCE_REF,
  engine: location.version,
  endpoint: "127.0.0.1:55439/atlas_schema_replay",
  platform:
    "local-replay-platform.sql: Auth/storage structural stand-ins, native pgcrypto, inert cron, net always throws, unusable local-only vault placeholder",
  extensions_omitted: [],
  migrations: [],
  status: "RUNNING",
};
await mkdir(output, { recursive: true });
try {
  const platformSql = await readFile(
    "docs/atlas/schema-review/local-replay-platform.sql",
    "utf8",
  );
  report.platform_sha256 = hash(platformSql);
  await client.query(platformSql);
  const index = JSON.parse(
    await readFile("docs/atlas/schema-review/source-inputs.json", "utf8"),
  );
  const files = {};
  for (const chunk of index.chunks) {
    const bytes = await readFile("docs/atlas/schema-review/" + chunk.filename);
    if (hash(bytes) !== chunk.sha256) throw Error("Snapshot mismatch");
    Object.assign(files, JSON.parse(gunzipSync(bytes).toString("utf8")));
  }
  const insertAfter = {
    "supabase/migrations/20260930133259_membership_and_payments.sql": [
      "supabase/schema/research_feed.sql",
    ],
    "supabase/migrations/20260930223839_personal_challenge_entries.sql": [
      "supabase/schema/personal_bankroll_adjustments.sql",
    ],
    "supabase/migrations/20261001124415_matchup_intelligence.sql": [
      "supabase/schema/edge_releases.sql",
    ],
  };
  const captures = {};
  for (const path of Object.keys(files)
    .filter((p) => p.startsWith("supabase/migrations/"))
    .sort()) {
    if (path.endsWith("20261106221738_dealer_profile_visibility.sql"))
      captures.pre_dealer = (
        await client.query(
          "select jsonb_agg(jsonb_build_object('signature',oid::regprocedure::text,'definition',pg_get_functiondef(oid))) definitions from pg_proc where oid in ('private.before_age_community_member(text)'::regprocedure,'private.community_activity()'::regprocedure,'public.community_avatars(uuid[])'::regprocedure)",
        )
      ).rows[0];
    if (path.endsWith("20261031190000_frank_anniversary.sql")) {
      await client.query(
        "insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000009001','frank-placeholder@vq-replay.invalid',now());insert into public.ruby_contributors(user_id,brand,theme) values('00000000-0000-4000-8000-000000009001','FranksCorner','corner')",
      );
      report.synthetic_replay_seed = {
        purpose:
          "Local migration precondition only; not a real contributor or staged seed",
        email: "frank-placeholder@vq-replay.invalid",
        user_id: "00000000-0000-4000-8000-000000009001",
      };
    }
    if (path.endsWith("20261031190200_zone_automated_cards.sql")) {
      await client.query(
        "insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000009002','publisher-placeholder@vq-replay.invalid',now());select set_config('request.jwt.claims','{\"sub\":\"00000000-0000-4000-8000-000000009002\"}',false);insert into public.community_profiles(user_id,username,visible,avatar) values('00000000-0000-4000-8000-000000009002','MikeQ',true,'data:image/jpeg;base64,eA==');insert into private.zone_automation(name,user_id) values('nba_threes','00000000-0000-4000-8000-000000009002'),('sports_editorial','00000000-0000-4000-8000-000000009002') on conflict(name) do update set user_id=excluded.user_id;select set_config('request.jwt.claims','{}',false)",
      );
      report.synthetic_publisher_seed = {
        purpose:
          "Local original migration precondition only; not staged Dealer seed",
        user_id: "00000000-0000-4000-8000-000000009002",
        email: "publisher-placeholder@vq-replay.invalid",
      };
    }
    const log = { path, sha256: hash(files[path]), statements: 0 };
    report.migrations.push(log);
    for (const unit of splitSql(files[path])) {
      const text = unit.sql.replace(/--[^\n]*/g, "").trim();
      if (/^create extension/i.test(text)) {
        report.extensions_omitted.push({
          path,
          sql: unit.sql,
          reason:
            "Managed extension unavailable; inert local platform stand-in, not a source-function rewrite",
        });
        continue;
      }
      try {
        await client.query(unit.sql);
        log.statements++;
      } catch (e) {
        log.failure = {
          statement: log.statements + 1,
          message: e.message,
          sql: unit.sql,
        };
        throw e;
      }
    }
    console.log(path);
    for (const baseline of insertAfter[path] ?? []) {
      await client.query(files[baseline]);
      report.migrations.push({
        path: baseline,
        sha256: hash(files[baseline]),
        inserted_after: path,
        reason:
          "Versioned repository baseline schema outside migration directory",
      });
    }
  }
  report.status = "PASS";
  const names = [
    "private.before_age_has_membership",
    "private.before_age_community_member",
    "private.submit_ruby_link",
    "private.edit_ruby_link",
    "public.desk_data_compact",
  ];
  const definitions = (
    await client.query(
      "select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,pg_get_userbyid(p.proowner) owner,p.prosecdef security_definer,p.proacl::text acl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=any($1::text[]) order by 1",
      [names],
    )
  ).rows;
  const views = (
    await client.query(
      "select c.oid::regclass::text name,pg_get_viewdef(c.oid,true) definition,c.reloptions options,c.relacl::text acl from pg_class c where c.oid in ('public.published_legs'::regclass,'public.ruby_cards'::regclass) order by 1",
    )
  ).rows;
  if (
    definitions.length !== 5 ||
    views.length !== 2 ||
    !captures.pre_dealer?.definitions?.length
  )
    throw Error("Effective definition coverage incomplete");
  definitions.forEach((d) => (d.sha256 = hash(d.definition)));
  views.forEach((v) => (v.sha256 = hash(v.definition)));
  const outbound = (
    await client.query(
      "select n.nspname||'.'||p.proname name,p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (lower(p.prosrc) like '%vegasquant.app%' or lower(p.prosrc) like '%net.%' or lower(p.prosrc) like '%http_post%' or lower(p.prosrc) like '%vault.decrypted_secrets%') order by 1,2",
    )
  ).rows;
  const dealerCallers = (
    await client.query(
      "select n.nspname||'.'||p.proname name,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f' and p.prosrc like '%is_dealer_publisher%' order by 1",
    )
  ).rows;
  const graph = (
    await client.query(
      "select n.nspname||'.'||p.proname name,p.prosrc body from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f'",
    )
  ).rows;
  const blocked = new Set(outbound.map((f) => f.name));
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of graph)
      if (
        !blocked.has(f.name) &&
        [...blocked].some((name) => f.body.includes(name + "("))
      ) {
        blocked.add(f.name);
        changed = true;
      }
  }
  const transitive = [...blocked]
    .filter((name) => !outbound.some((f) => f.name === name))
    .sort();
  const pause = (
    await client.query(
      "select tgname from pg_trigger where tgname in ('kalshi_submission_pause','kalshi_revision_pause') order by tgname",
    )
  ).rows;
  report.effective_coverage = {
    functions: definitions.length,
    views: views.length,
    migration_files: report.migrations.filter((m) =>
      m.path.startsWith("supabase/migrations/"),
    ).length,
    baseline_files: report.migrations.filter((m) =>
      m.path.startsWith("supabase/schema/"),
    ).length,
  };
  report.status = "PASS";
  await writeFile(
    output + "/outbound-functions.json",
    JSON.stringify(
      {
        source_ref: SOURCE_REF,
        status: "LOCAL_ORIGINAL_REPLAY_REFERENCE_ONLY_OMIT_FROM_STAGING",
        functions: outbound,
        transitive_callers: transitive,
        kalshi_pause_triggers: pause,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    output + "/effective-definitions.json",
    JSON.stringify(
      {
        source_ref: SOURCE_REF,
        status: "LOCAL_REPLAY_EVIDENCE_NOT_HOSTED_CATALOG",
        definitions,
        views,
        captures,
        dealer_callers: dealerCallers,
      },
      null,
      2,
    ) + "\n",
  );
} catch (e) {
  report.status = "FAIL";
  report.failure = e.message;
  process.exitCode = 1;
} finally {
  await writeFile(
    output + "/replay-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  await client.end();
}
