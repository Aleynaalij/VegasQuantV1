import { NextRequest, NextResponse } from "next/server";
import { privateAccessConfig } from "./private-access-stage-config";
import { authorizeStageToken, stageToken } from "./private-access-stage";
import { stageFeatureManifest } from "./stage-feature-manifest";
import { GET as originalSheet } from "../app/api/nba/matchup-sheet/[id]/route";
const unavailable = (status: number) =>
  NextResponse.json(
    { error: "Matchup sheet unavailable." },
    {
      status,
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    },
  );
export async function stageMatchupSheet(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
  transport = fetch,
  render = originalSheet,
) {
  const config = privateAccessConfig(process.env);
  if (!config || process.env.VQ_STAGE_BUILD_PROFILE !== "combined")
    return unavailable(404);
  if (
    request.method !== "GET" ||
    request.nextUrl.search ||
    request.headers.has("authorization")
  )
    return unavailable(400);
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id))
    return unavailable(404);
  const token = stageToken(request);
  if (!token) return unavailable(401);
  try {
    const gate = await authorizeStageToken(config, token, transport);
    if (gate !== 200) return unavailable(gate);
    if (!(await stageFeatureManifest(config, token, transport)).research)
      return unavailable(503);
    // Auth is projected internally only. No browser SDK token or service-role key.
    const result = await render(
      new Request(`${config.origin}/api/nba/matchup-sheet/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ id }) },
    );
    if (!result.ok)
      return unavailable(
        [401, 403, 404].includes(result.status) ? result.status : 503,
      );
    const body = await result.text();
    if (body.length > 4000000) return unavailable(503);
    if (!(await stageFeatureManifest(config, token, transport)).research)
      return unavailable(403);
    const finalGate = await authorizeStageToken(config, token, transport);
    if (finalGate !== 200) return unavailable(finalGate);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return unavailable(503);
  }
}
