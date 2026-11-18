import { NextRequest, NextResponse } from "next/server";
import { privateAccessConfig } from "./private-access-stage-config";
import { authorizeStageToken, stageToken } from "./private-access-stage";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const fail = (
  status: number,
  message = "This feature has no verified isolated staging contract.",
) =>
  NextResponse.json(
    { code: "VQ_STAGE_UNAVAILABLE", message },
    { status, headers },
  );
// Only existing reviewed fixture invoker contracts. No generic RPC/schema forwarding,
// notification dispatch, storage, account changes, or community mutation capability.
const rpcArgs: Record<string, readonly string[]> = {
  age_verification_status: [],
  membership_status: [],
  sports_slate: ["p_sport", "p_days"],
  game_zone_posts: ["p_sport", "p_game", "p_limit"],
};
export function stageDataQuery(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) => !["path", "query", "method", "accept", "body"].includes(k),
    ) ||
    typeof v.path !== "string" ||
    v.query !== "" ||
    v.method !== "POST"
  )
    return null;
  const match = /^rpc\/([a-z_]+)$/.exec(v.path);
  if (!match || !Object.hasOwn(rpcArgs, match[1]) || typeof v.body !== "string")
    return null;
  if (v.accept !== null && v.accept !== "application/json") return null;
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(v.body);
  } catch {
    return null;
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !rpcArgs[match[1]].includes(k))
  )
    return null;
  if (
    "p_sport" in body &&
    !["nba", "nhl", "nfl", "ncaab"].includes(String(body.p_sport))
  )
    return null;
  if (match[1] === "sports_slate" && !("p_sport" in body)) return null;
  if (
    match[1] === "game_zone_posts" &&
    (!/^[0-9a-f-]{36}$/i.test(String(body.p_game)) ||
      !["nba", "nhl", "nfl", "ncaab"].includes(String(body.p_sport)))
  )
    return null;
  if (
    "p_days" in body &&
    (!Number.isInteger(body.p_days) ||
      Number(body.p_days) < 1 ||
      Number(body.p_days) > 14)
  )
    return null;
  if (
    "p_limit" in body &&
    (!Number.isInteger(body.p_limit) ||
      Number(body.p_limit) < 1 ||
      Number(body.p_limit) > 30)
  )
    return null;
  return { path: v.path, body: JSON.stringify(body) };
}
export async function stageDataGateway(
  request: NextRequest,
  transport = fetch,
) {
  const config = privateAccessConfig(process.env);
  if (!config || process.env.VQ_STAGE_BUILD_PROFILE !== "combined")
    return fail(404);
  if (request.method !== "POST") return fail(405);
  if (
    request.nextUrl.search ||
    request.headers.has("authorization") ||
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return fail(403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return fail(415);
  const token = stageToken(request);
  if (!token) return fail(401);
  const access = await authorizeStageToken(config, token, transport);
  if (access !== 200) return fail(access);
  try {
    const text = await request.text();
    if (text.length > 8192) return fail(413);
    const query = stageDataQuery(JSON.parse(text));
    if (!query) return fail(503);
    const upstreamHeaders = {
      apikey: config.key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
    const call = (path: string, body: string) =>
      transport(`${config.url}/rest/v1/${path}`, {
        method: "POST",
        headers: upstreamHeaders,
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
    const [age, member] = await Promise.all([
      call("rpc/age_verification_status", "{}"),
      call("rpc/membership_status", "{}"),
    ]);
    if (!age.ok || !member.ok) return fail(503);
    const a = await age.json(),
      m = await member.json();
    if (a?.synthetic !== true || a?.verified !== true || m?.allowed !== true)
      return fail(403);
    const result = await call(query.path, query.body);
    if (!result.ok)
      return fail(result.status === 401 || result.status === 403 ? 403 : 503);
    const payload = await result.text();
    if (payload.length > 2_000_000) return fail(503);
    // Strip backend headers/errors. These fixed invoker RPCs are the reviewed public projections.
    const data: unknown = JSON.parse(payload);
    // A successful initial check is not permission to return a now-revoked read.
    const [finalAge, finalMember] = await Promise.all([
      call("rpc/age_verification_status", "{}"),
      call("rpc/membership_status", "{}"),
    ]);
    if (!finalAge.ok || !finalMember.ok) return fail(503);
    const finalA = await finalAge.json(),
      finalM = await finalMember.json();
    if (
      finalA?.synthetic !== true ||
      finalA?.verified !== true ||
      finalM?.allowed !== true
    )
      return fail(403);
    const current = await authorizeStageToken(config, token, transport);
    return current === 200
      ? NextResponse.json(data, { headers })
      : fail(current);
  } catch {
    return fail(503);
  }
}
