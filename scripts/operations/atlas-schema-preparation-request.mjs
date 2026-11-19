/** Build connector arguments only AFTER independent approval has been verified on GitHub.
 * This utility verifies bytes and pins project_id. A URL string alone is not approval;
 * the operator must read Claude's comment and verify it approves the exact hash.
 * No network access, arbitrary target, credentials, or direct SQL execution exists here.
 */
import { readFile } from "node:fs/promises";
import { hash } from "./atlas-schema-review.mjs";
import { TARGET, DIRECTORY } from "./atlas-schema-prepare.mjs";
/** @param {{artifact?:string,approvedSha256?:string,signoffUrl?:string,target?:string}} [options] */
export async function preparationRequest({
  artifact,
  approvedSha256,
  signoffUrl,
  target = TARGET,
} = {}) {
  if (target !== TARGET)
    throw Error("Only isolated staging target is permitted");
  if (!["prepare", "identities"].includes(artifact))
    throw Error("Select exactly one reviewed artifact");
  if (!/^[0-9a-f]{64}$/.test(approvedSha256 ?? ""))
    throw Error("Exact independently approved SHA256 required");
  if (
    !/^https:\/\/github\.com\/Aleynaalij\/VegasQuantV1\/issues\/294#issuecomment-[0-9]+$/.test(
      signoffUrl ?? "",
    )
  )
    throw Error("Verified sign-off comment on #294 required");
  const sql = await readFile(`${DIRECTORY}/${artifact}.sql`, "utf8");
  const seal = (
    await readFile(`${DIRECTORY}/${artifact}.sha256`, "utf8")
  ).split(/\s+/)[0];
  if (hash(sql) !== seal || seal !== approvedSha256)
    throw Error("Approved hash differs from execution bytes");
  if (!sql.includes(`set local vq.review.target_ref='${TARGET}'`))
    throw Error("Missing SQL target assertion");
  return { project_id: TARGET, query: sql };
}
