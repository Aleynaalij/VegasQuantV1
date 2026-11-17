import { supabaseUrl, publishableKey } from "./supabase";
import { emptyDesk, type Desk } from "./domain";
export async function getDesk(): Promise<Desk> {
  let authorization: Record<string, string> = {};
  if (process.env.VQ_COMBINED_STAGE_BUILD === "1") {
    const { privateAccessConfig } = await import(
      "./private-access-stage-config"
    );
    const { authorizeStageToken, stageToken } = await import(
      "./private-access-stage"
    );
    const { headers } = await import("next/headers");
    const { NextRequest } = await import("next/server");
    const config = privateAccessConfig(process.env);
    if (!config) throw new Error("Isolated staging configuration unavailable");
    const token = stageToken(
      new NextRequest(config.origin, { headers: await headers() }),
    );
    if (!token || (await authorizeStageToken(config, token)) !== 200)
      throw new Error("Staging session denied");
    authorization = { Authorization: `Bearer ${token}` };
  }
  const r = await fetch(`${supabaseUrl}/rest/v1/rpc/desk_data`, {
    method: "POST",
    headers: {
      ...authorization,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: "{}",
    cache: "no-store",
    ...(process.env.VQ_COMBINED_STAGE_BUILD === "1"
      ? {
          redirect: "error" as const,
          signal: AbortSignal.timeout(5000),
        }
      : {}),
  });
  if (!r.ok)
    throw new Error("The research desk could not load. Please try again.");
  return r.json();
}
/**
 * For pages that also refresh in the browser: a failed server load renders an empty desk
 * flagged `unavailable` instead of the full-page error, and the client retries.
 */
export async function getDeskOrEmpty(): Promise<Desk> {
  try {
    return await getDesk();
  } catch {
    // free_core keeps the normal Home/Records layout (live value is true); member data stays behind RLS.
    return { ...emptyDesk, unavailable: true, free_core: true } as Desk;
  }
}
