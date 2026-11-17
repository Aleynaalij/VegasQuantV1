import type { NextRequest } from "next/server";
import { privateAccessConfig } from "../../../../lib/private-access-stage-config";
import { readStageRecords, stageResponse, stageToken } from "../../../../lib/private-access-stage";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const config = privateAccessConfig(process.env);
  if (!config) return stageResponse(null, 404);
  const result = await readStageRecords(config, stageToken(request));
  return stageResponse(
    result.status === 200 ? JSON.stringify({ records: result.records }) : null,
    result.status,
    "application/json",
  );
}
