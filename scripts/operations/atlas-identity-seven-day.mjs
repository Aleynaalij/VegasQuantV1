/** Offline interval-only revision of the independently approved post-free identity SQL. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { hash } from "./atlas-schema-review.mjs";
export const IDENTITY_SEVEN_DIRECTORY = "docs/atlas/identity-seven-day-review";
export async function sevenDayIdentity(output = IDENTITY_SEVEN_DIRECTORY) {
  const original = await readFile(
    "docs/atlas/free-home-review/identities-after-free-home.sql",
    "utf8",
  );
  if (
    hash(original) !==
    "ee6f722f496e8dc132e3206d50ecb8a0052ad02ead30c3d24b0fb2d96da7fba7"
  )
    throw Error("Approved identity source changed");
  if (
    original.split("transaction_timestamp()+interval '24 hours'").length !== 5
  )
    throw Error("Expected four future expiries");
  let sql = original.replaceAll(
    "transaction_timestamp()+interval '24 hours'",
    "transaction_timestamp()+interval '7 days'",
  );
  const id = JSON.parse(
    await readFile("docs/atlas/schema-preparation/identity-map.json", "utf8"),
  ).identities.find(
    (i) => i.email === "not-started-verified@vq-fixture.invalid",
  ).id;
  const old = `values('${id}',true,transaction_timestamp()+interval '1 hour',transaction_timestamp()+interval '7 days',null)`;
  const next = `values('${id}',true,transaction_timestamp()+interval '7 days',transaction_timestamp()+interval '14 days',null)`;
  if (sql.split(old).length !== 2)
    throw Error("Not-started identity anchor changed");
  sql = sql.replace(old, next);
  await mkdir(output, { recursive: true });
  await writeFile(output + "/identities-seven-day.sql", sql);
  await writeFile(
    output + "/identities-seven-day.sha256",
    hash(sql) + "  identities-seven-day.sql\n",
  );
  const diff = {
    status: "AWAITING_CLAUDE_INTERVAL_ONLY_REVIEW_NO_IDENTITY_EXECUTION",
    target: "caynldluziwrzmvuslzg",
    source_approved_sha256: hash(original),
    proposed_sha256: hash(sql),
    changed_constants: 5,
    changes: {
      active_expiry: "+7 days",
      entitled_unverified_expiry: "+7 days",
      revoked_expiry: "+7 days",
      not_started_start: "+7 days",
      not_started_expiry:
        "+14 days (seven-day eligible window after future start)",
    },
    unchanged:
      "All UUIDs, metadata, past bounds, expired/revoked states, grants, gate allowlisting, original-column digests and I1 sequencing; only five future interval constants differ",
  };
  await writeFile(
    output + "/manifest.json",
    JSON.stringify(diff, null, 2) + "\n",
  );
  return diff;
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const i = process.argv.indexOf("--out");
  console.log(
    JSON.stringify(
      await sevenDayIdentity(
        i < 0 ? IDENTITY_SEVEN_DIRECTORY : process.argv[i + 1],
      ),
    ),
  );
}
