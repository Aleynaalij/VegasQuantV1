/** Offline source evidence only. No connection, migration execution, or catalog approval. */
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";

export const SOURCE_REF = "8d6b0446094f234e4ad7b8e6539a59adb1cdeaeb";
export const hash = (text) => createHash("sha256").update(text).digest("hex");

/** Preserve function/DO bodies, quoted semicolons and nested comments as one unit. */
export function splitSql(sql) {
  const result = [];
  let start = 0,
    quote = null,
    dollar = null,
    line = false,
    block = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i],
      next = sql[i + 1];
    if (line) {
      if (ch === "\n") line = false;
      continue;
    }
    if (block) {
      if (ch === "/" && next === "*") {
        block++;
        i++;
      } else if (ch === "*" && next === "/") {
        block--;
        i++;
      }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) {
        i += dollar.length - 1;
        dollar = null;
      }
      continue;
    }
    if (quote) {
      if (ch === quote && next === quote) {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      // E'...' escape syntax; conservative handling also keeps ordinary strings intact.
      else if (ch === "\\") i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      line = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      block = 1;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    const tag =
      ch === "$" && /^(\$[a-zA-Z_][a-zA-Z_0-9]*\$|\$\$)/.exec(sql.slice(i));
    if (tag) {
      dollar = tag[0];
      i += dollar.length - 1;
      continue;
    }
    if (ch === ";") {
      result.push({ start, end: i + 1, sql: sql.slice(start, i + 1) });
      start = i + 1;
    }
  }
  if (quote || dollar || block) throw Error("Unterminated SQL source unit");
  if (sql.slice(start).trim())
    result.push({ start, end: sql.length, sql: sql.slice(start) });
  return result;
}
const refs = (sql) =>
  [
    ...new Set(
      [
        ...sql.matchAll(
          /\b(public|private|auth|vq_fixture|vq_private_access_stage|storage|vault|cron|net)\.([a-z_][a-z_0-9]*)\b/gi,
        ),
      ].map((m) => `${m[1]}.${m[2]}`.toLowerCase()),
    ),
  ].sort();
const head = (sql) =>
  sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/g, "").trim();
const terminal = (name) =>
  /^(auth|storage|vault|cron|net|vq_fixture)\./.test(name);
export function describe(sql) {
  const statement = head(sql);
  const references = refs(statement);
  const declaration =
    /^(?:create\s+(?:or\s+replace\s+)?(?:unlogged\s+)?|alter\s+|drop\s+)(?:table|view|materialized\s+view|function|procedure)\s+(?:if\s+(?:not\s+)?exists\s+)?((?:public|private|vq_private_access_stage)\.[a-z_][a-z_0-9]*)/i.exec(
      statement,
    );
  const on =
    /^(?:create\s+(?:constraint\s+)?(?:policy|trigger)|drop\s+(?:policy|trigger)|alter\s+policy)[\s\S]*?\bon\s+((?:public|private|auth|storage|vq_private_access_stage)\.[a-z_][a-z_0-9]*)/i.exec(
      statement,
    );
  const dml =
    /^(?:insert\s+into|update|delete\s+from)\s+((?:public|private|vq_private_access_stage)\.[a-z_][a-z_0-9]*)/i.exec(
      statement,
    );
  const dynamic = /^do\b/i.test(statement);
  const acl = /^(?:grant|revoke)\b/i.test(statement);
  const subjects = declaration
    ? [declaration[1].toLowerCase()]
    : on
      ? [on[1].toLowerCase()]
      : dml
        ? [dml[1].toLowerCase()]
        : dynamic || acl
          ? references
          : [];
  const risk_tags = [];
  for (const [tag, regex] of [
    ["security_definer", /\bsecurity\s+definer\b/i],
    [
      "dynamic_sql_or_catalog_rewrite",
      /\bexecute\b|pg_get_functiondef|pg_get_viewdef/i,
    ],
    [
      "scheduler",
      /cron\.(schedule|unschedule)|create\s+extension[^;]*pg_cron/i,
    ],
    ["outbound_or_dispatch", /net\.http_|https?:\/\/|invoke_.*dispatch/i],
    [
      "vault_or_provider_config",
      /vault\.|private\.(push_config|zone_automation|stripe|billing)/i,
    ],
    ["storage_change", /(?:on|into|table|update|from)\s+storage\./i],
    ["auth_trigger", /\bon\s+auth\./i],
    [
      "data_or_role_change",
      /^(?:insert|update|delete|truncate|alter\s+role|create\s+role)\b/i,
    ],
    ["ddl_destructive_or_rename", /\bdrop\b|\brename\b|\bset\s+schema\b/i],
    ["privileges", /^(?:grant|revoke)\b/i],
  ])
    if (regex.test(statement)) risk_tags.push(tag);
  return {
    subjects,
    references,
    declaration: /^create\b/i.test(statement)
      ? (declaration?.[1].toLowerCase() ?? null)
      : null,
    dynamic,
    risk_tags,
  };
}

export function dependencyClosure(units, roots) {
  const names = new Set(roots),
    included = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < units.length; i++) {
      if (
        included.has(i) ||
        !units[i].subjects.some((n) => names.has(n) && !terminal(n))
      )
        continue;
      included.add(i);
      changed = true;
      for (const n of units[i].references) if (!terminal(n)) names.add(n);
    }
  }
  return {
    names: [...names].sort(),
    units: [...included].sort((a, b) => a - b).map((i) => units[i]),
  };
}

export async function buildReview(output) {
  // Ship the pinned source inputs so shallow CI checkouts and offline reviewers
  // reproduce the same evidence without a network fetch or mutable working files.
  const inputRoot = new URL("../../docs/atlas/schema-review/", import.meta.url);
  const index = JSON.parse(
    await readFile(new URL("source-inputs.json", inputRoot), "utf8"),
  );
  if (index.source_ref !== SOURCE_REF)
    throw Error("Unexpected source snapshot ref");
  const snapshot = {};
  for (const chunk of index.chunks) {
    if (!/^source-inputs-[0-9]+[.]json[.]gz$/.test(chunk.filename))
      throw Error("Invalid source chunk name");
    const bytes = await readFile(new URL(chunk.filename, inputRoot));
    if (hash(bytes) !== chunk.sha256)
      throw Error("Source snapshot integrity mismatch");
    const files = JSON.parse(gunzipSync(bytes).toString("utf8"));
    for (const [path, content] of Object.entries(files)) {
      if (Object.hasOwn(snapshot, path) || typeof content !== "string")
        throw Error("Duplicate or malformed source input");
      snapshot[path] = content;
    }
  }
  const read = (path) => {
    if (!Object.hasOwn(snapshot, path))
      throw Error(`Missing pinned source: ${path}`);
    return snapshot[path];
  };
  const paths = Object.keys(snapshot).sort();
  const sources = paths
    .filter(
      (p) =>
        (p.startsWith("supabase/migrations/") ||
          p.startsWith("supabase/schema/")) &&
        p.endsWith(".sql"),
    )
    .sort();
  const registry = JSON.parse(read("src/lib/stage-feature-registry.json"));
  const rootObjects = [
    ...Object.entries(registry.tables).map(([name, rule]) => ({
      name: `public.${name}`,
      kind: ["published_legs", "ruby_cards"].includes(name)
        ? "security_invoker_view"
        : "table",
      group: rule.group,
      contract: rule,
    })),
    ...Object.entries(registry.rpcs).map(([name, rule]) => ({
      name: `public.${name}`,
      kind: "function",
      group: rule.group,
      contract: rule,
    })),
    ...[...new Set(Object.values(registry.requirements).flat())].map(
      (name) => ({ name, kind: "prerequisite", group: "research" }),
    ),
  ];
  const units = [],
    sourceMetadata = [];
  for (const path of sources) {
    const sql = read(path),
      fileUnits = splitSql(sql).map((unit, index) => ({
        id: `${path}:${index + 1}`,
        path,
        start_line: sql.slice(0, unit.start).split("\n").length,
        end_line: sql.slice(0, unit.end).split("\n").length,
        sha256: hash(unit.sql),
        ...describe(unit.sql),
        sql: unit.sql,
      }));
    units.push(...fileUnits);
    sourceMetadata.push({
      path,
      sha256: hash(sql),
      bytes: Buffer.byteLength(sql),
      units: fileUnits.length,
    });
  }
  const closure = dependencyClosure(
    units,
    rootObjects.map((r) => r.name),
  );
  const selectedPaths = new Set(closure.units.map((u) => u.path));
  const manifest = {
    format: "vq-atlas-schema-review-v1",
    status: "PROPOSED_UNREVIEWED_NOT_INSTALLABLE",
    source_ref: SOURCE_REF,
    target_project: "caynldluziwrzmvuslzg",
    production_forbidden: "uowearboulykfcwnuirn",
    catalog_status: "NO_REVIEWED_CATALOG_CREATED",
    reviewer_status:
      "Claude is reviewer of record; CHANGES REQUIRED pending exact-commit re-review",
    owner_decisions: {
      record:
        "https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6998422208",
      staging_boundary:
        "Trusted operator, staging only; mandatory DDL/RLS preflight; operators Codex and Mike",
      dealer:
        "OFF: no staged Dealer identity, attribution seed or Dealer visibility rewrite",
      effective_definitions:
        "Disposable native local PostgreSQL replay only; never production",
      production:
        "NO-GO; staging boundary decision does not carry to production",
    },
    limitations: [
      "Conservative lexical source dependency index, not a PostgreSQL semantic dependency proof.",
      "All historical source units are evidence; their order is NOT an install plan.",
      "Dynamic rewrites, unqualified references, overloads and runtime SQL require manual resolution.",
      "Source SHA256 and registry function hashes do not approve a target-specific hosted catalog.",
      "Original complete consumer schema and publication/research dependencies must be reconciled before installation.",
    ],
    roots: rootObjects.map((root) => ({
      ...root,
      source_units: closure.units
        .filter((u) => u.subjects.includes(root.name))
        .map((u) => u.id),
      direct_declarations: closure.units
        .filter((u) => u.declaration === root.name)
        .map((u) => u.id),
    })),
    dependency_names: closure.names,
    boundary_references: [
      ...new Set(closure.units.flatMap((u) => u.references).filter(terminal)),
    ].sort(),
    unresolved_source_names: closure.names.filter(
      (n) => !terminal(n) && !units.some((u) => u.declaration === n),
    ),
    gate_sources: paths
      .filter((p) =>
        /^scripts\/operations\/private-(?:access-stage|development-policy)/.test(
          p,
        ),
      )
      .sort()
      .map((path) => ({ path, sha256: hash(read(path)) })),
    sources: sourceMetadata.filter((s) => selectedPaths.has(s.path)),
  };
  const replayRoot = new URL(
    "../../docs/atlas/schema-review/local-replay/",
    import.meta.url,
  );
  const replay = JSON.parse(
    await readFile(new URL("effective-definitions.json", replayRoot), "utf8"),
  );
  const replayReport = JSON.parse(
    await readFile(new URL("replay-report.json", replayRoot), "utf8"),
  );
  if (
    replay.source_ref !== SOURCE_REF ||
    replayReport.status !== "PASS" ||
    replayReport.effective_coverage?.migration_files !== 187 ||
    replayReport.effective_coverage?.baseline_files !== 3
  )
    throw Error("Native replay evidence incomplete");
  const qualified = (signature) =>
    signature.includes(".")
      ? signature.split("(")[0]
      : "public." + signature.split("(")[0];
  const resolved = new Set(
    replay.definitions.map((f) => qualified(f.signature)),
  );
  manifest.lexical_unresolved_source_names = manifest.unresolved_source_names;
  manifest.unresolved_source_names = manifest.unresolved_source_names.filter(
    (name) => !resolved.has(name),
  );
  manifest.effective_definition_evidence = {
    status: "Native local replay, not hosted catalog approval",
    source_ref: SOURCE_REF,
    engine: replayReport.engine,
    functions: replay.definitions.map((f) => ({
      signature: f.signature,
      sha256: hash(f.definition),
    })),
    views: replay.views.map((v) => ({
      name: v.name,
      sha256: hash(v.definition),
    })),
    adaptations: "adaptations.json",
    platform_limitations:
      "Explicit Auth/storage/cron/net stand-ins, unusable local placeholder and synthetic migration-precondition identities; see replay report. Never copy replay platform to staging.",
  };
  const excludedRiskUnits = units.filter(
    (u) =>
      selectedPaths.has(u.path) &&
      u.risk_tags.length &&
      !closure.units.some((c) => c.id === u.id),
  );
  await mkdir(output, { recursive: true });
  const outputs = {
    "manifest.json": manifest,
    "original-statements.json": {
      status: manifest.status,
      source_ref: SOURCE_REF,
      statements: closure.units,
    },
    "adjacent-risk-statements.json": {
      status: "REFERENCE_ONLY_NOT_PROPOSED_FOR_INSTALL",
      source_ref: SOURCE_REF,
      statements: excludedRiskUnits,
    },
  };
  outputs["review-index.md"] = [
    "# Original contract source navigation",
    "",
    `Source ref: \`${SOURCE_REF}\`. PROPOSED / UNREVIEWED. History is not install order. Full text is in original-statements.json.gz.`,
    "",
    "| Group | Object | Contract | Source history |",
    "|---|---|---|---|",
    ...manifest.roots.map((root) => {
      const contract = root.contract ?? {};
      const paths = [
        ...new Set(
          root.source_units.map((id) => id.slice(0, id.lastIndexOf(":"))),
        ),
      ];
      const links = paths
        .map(
          (path) =>
            `[${path.split("/").at(-1)}](https://github.com/Aleynaalij/VegasQuantV1/blob/${SOURCE_REF}/${path})`,
        )
        .join("<br>");
      return `| ${root.group} | \`${root.name}\` | ${contract.signature ?? contract.methods?.join(", ") ?? root.kind} | ${links} |`;
    }),
    "",
  ].join("\n");
  const hashes = {};
  const uncompressed_hashes = {};
  for (const [name, value] of Object.entries(outputs)) {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n";
    const compressed = name.endsWith(".json") && name !== "manifest.json";
    const filename = compressed ? `${name}.gz` : name;
    const bytes = compressed ? gzipSync(text, { level: 9 }) : text;
    await writeFile(resolve(output, filename), bytes);
    hashes[filename] = hash(bytes);
    uncompressed_hashes[name] = hash(text);
  }
  await writeFile(
    resolve(output, "source-hashes.json"),
    JSON.stringify(
      {
        purpose: "Source evidence hashes ONLY; not a reviewed hosted catalog",
        source_ref: SOURCE_REF,
        sha256: hashes,
        uncompressed_sha256: uncompressed_hashes,
      },
      null,
      2,
    ) + "\n",
  );
  return {
    roots: rootObjects.length,
    dependencies: closure.names.length,
    sources: manifest.sources.length,
    statements: closure.units.length,
    adjacent_risks: excludedRiskUnits.length,
    hashes,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const index = process.argv.indexOf("--out");
  if (index < 0 || !process.argv[index + 1])
    throw Error(
      "Use --out DIRECTORY. This command only writes review evidence; it never executes SQL.",
    );
  console.log(
    JSON.stringify(
      await buildReview(resolve(process.argv[index + 1])),
      null,
      2,
    ),
  );
}
