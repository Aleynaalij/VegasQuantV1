// Deterministic proposal derivation from committed LOCAL replay evidence only.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const root = "docs/atlas/schema-review/";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const replay = JSON.parse(
  await readFile(root + "local-replay/effective-definitions.json", "utf8"),
);
const name = (s) =>
  s.includes(".") ? s.split("(")[0] : "public." + s.split("(")[0];
const records = [];
for (const f of replay.definitions) {
  const object = name(f.signature);
  records.push({
    object,
    signature: f.signature,
    replayed_definition_sha256: hash(f.definition),
    adaptation:
      object === "private.before_age_has_membership"
        ? "REPLACE with stored staging entitlement lookup in eligibility-adapters.sql.proposed; exclude private.existing_member_premium and its blanket auth.users seed"
        : object === "private.before_age_community_member"
          ? "USE_PRE_DEALER_CAPTURE"
          : object === "public.desk_data_compact"
            ? "Use FINAL latest-analysis replay body; original anon EXECUTE is recorded, revoke anon in the private staged surface"
            : "Use final replayed link-aware body AND include both Kalshi pause triggers from 20261106225003; historical links remain readable, new/changed links remain blocked",
    original_owner: f.owner,
    original_acl: f.acl,
  });
}
const proposed = [];
for (const f of replay.captures.pre_dealer.definitions) {
  proposed.push({
    object: name(f.signature),
    signature: f.signature,
    source: "pre-Dealer capture before 20261106221738",
    original_sha256: hash(f.definition),
    proposed_sql: f.definition,
    proposed_sha256: hash(f.definition),
    status: "UNREVIEWED",
  });
}
for (const f of replay.dealer_callers.filter((f) =>
  [
    "public.community_profile",
    "private.community_follow_target_allowed",
    "private.notification_actor_followed",
  ].includes(f.name),
)) {
  const needle =
    f.name === "private.notification_actor_followed"
      ? "or private.is_dealer_publisher(p_actor)"
      : "or private.is_dealer_publisher(u.id)";
  if (f.definition.split(needle).length !== 2)
    throw Error("Dealer adaptation anchor changed: " + f.name);
  const sql = f.definition.replace(needle, "");
  proposed.push({
    object: f.name,
    source:
      "final native replay; remove ONLY Dealer exception, preserving ordinary visibility/follow/age/block/identity guards",
    original_sha256: hash(f.definition),
    proposed_sql: sql,
    proposed_sha256: hash(sql),
    status: "UNREVIEWED",
  });
}
const unavailable = replay.dealer_callers
  .filter((f) => !proposed.some((p) => p.object === f.name))
  .map((f) => f.name);
for (const view of replay.views)
  records.push({
    object: name(view.name + "("),
    replayed_definition_sha256: hash(view.definition),
    adaptation:
      "Use final replayed security-invoker view and complete approved source-table graph; preserve published_legs archive OID/data, revoke authenticated SELECT on archive",
    options: view.options,
    original_acl: view.acl,
  });
await writeFile(
  root + "adaptations.json",
  JSON.stringify(
    {
      status: "UNREVIEWED_PROPOSAL_NOT_INSTALL_SQL",
      source_ref: replay.source_ref,
      objects: records,
      proposed_functions: proposed,
      unavailable_dealer_functions: unavailable,
      excluded: [
        "private.is_dealer_publisher",
        "private.existing_member_premium",
        "all production account/admin/Dealer/complimentary seeds",
        "all storage.objects policy units and bucket provisioning",
      ],
      registry_note:
        "Adapted stage function hashes intentionally differ from production. They require independent equivalence review and a separately reviewed stage registry alignment; do not force capabilities or bless a fresh export.",
    },
    null,
    2,
  ) + "\n",
);
