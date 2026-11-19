import type { NextRequest } from "next/server";
import { PRIVATE_ACCESS_PATH, privateAccessConfig } from "../../../../lib/private-access-stage-config";
import { escapeStageHtml, readStageRecords, stagePage, stageResponse, stageToken } from "../../../../lib/private-access-stage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = privateAccessConfig(process.env);
  if (!config) return stageResponse(null, 404);
  const result = await readStageRecords(config, stageToken(request));
  if (result.status !== 200) {
    return stagePage("Protected staging records", `<p><a href="${PRIVATE_ACCESS_PATH}">Sign in to staging</a></p>`, result.status);
  }
  const records = result.records.map((record) => `<li>${escapeStageHtml(record)}</li>`).join("");
  return stagePage("Protected staging records", `
    <ul>${records}</ul>
    <form method="post" action="${PRIVATE_ACCESS_PATH}">
      <input type="hidden" name="action" value="signout">
      <button type="submit">Sign out</button>
    </form>`);
}
