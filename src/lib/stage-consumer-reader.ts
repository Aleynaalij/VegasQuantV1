import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { privateAccessConfig } from "./private-access-stage-config";
import { authorizeStageToken, stageToken } from "./private-access-stage";
import { readResearchHubWithClient } from "./research-hub-reader";
import { stageDealerPosts } from "./stage-dealer-contract";
import { gameZonePosts } from "./game-zone-posts";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
};
const denied = (status: number) => new NextResponse(null, { status, headers });
/** Combined build only. Every read uses the same live session as the gate, never service credentials. */
export async function readStageConsumer(
  request: NextRequest,
  resource: string,
  transport = fetch,
) {
  const config = privateAccessConfig(process.env);
  if (process.env.VQ_STAGE_BUILD_PROFILE !== "combined" || !config)
    return denied(404);
  if (request.method !== "GET") return denied(405);
  if (resource !== "dealer" && resource !== "research") return denied(404);
  const query = request.nextUrl.searchParams;
  if (
    [...query.keys()].some((k) => k !== "sport") ||
    query.getAll("sport").length > 1 ||
    (resource === "research" && query.size)
  )
    return denied(400);
  const sport = query.get("sport") ?? "all";
  if (!["all", "nba", "nhl", "nfl", "ncaab"].includes(sport))
    return denied(400);
  const token = stageToken(request);
  if (!token) return denied(401);
  const access = await authorizeStageToken(config, token, transport);
  if (access !== 200) return denied(access);
  // Restrict transport even if a downstream reader is changed to use another endpoint.
  const scopedFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== config.url || !url.pathname.startsWith("/rest/v1/"))
      return Promise.reject(new Error("Outside staging research boundary"));
    return transport(input, {
      ...init,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
  };
  const client = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: scopedFetch,
    },
  });
  try {
    // Age and original entitlement gates are independent of the private-access allowlist.
    const [age, member] = await Promise.all([
      client.rpc("age_verification_status"),
      client.rpc("membership_status"),
    ]);
    if (age.error || member.error) return denied(503);
    if (
      age.data?.synthetic !== true ||
      age.data?.verified !== true ||
      member.data?.allowed !== true
    )
      return denied(403);
    let payload: unknown;
    if (resource === "dealer") {
      const result = await client.rpc("vq_private_access_stage_dealer_feed", {
        p_sport: sport,
        p_limit: 3,
      });
      if (result.error) return denied(503);
      if (result.data === null) return denied(403);
      if (
        result.data?.contract !== "vq-stage-dealer-v1" ||
        !Array.isArray(result.data.posts)
      )
        return denied(503);
      const projected = stageDealerPosts(result.data.posts, sport);
      if (!projected) return denied(503);
      const posts = gameZonePosts(projected);
      payload = { state: "ready", posts };
    } else {
      const research = await readResearchHubWithClient(client, true);
      if (research.denied) return denied(403);
      payload = research;
    }
    // Discard completed reads if the session was revoked while the backend was loading.
    const current = await authorizeStageToken(config, token, transport);
    return current === 200
      ? NextResponse.json(payload, { headers })
      : denied(current);
  } catch {
    return denied(503);
  }
}
