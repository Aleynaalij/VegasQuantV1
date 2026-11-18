import { NextRequest, NextResponse } from "next/server";
import { privateAccessConfig } from "./private-access-stage-config";
import {
  authorizeStageToken,
  stageToken,
  stageRedirect,
} from "./private-access-stage";
import { projectViewerUser, unavailableCapabilities } from "./viewer-contract";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const fail = (status: number) =>
  NextResponse.json(
    {
      state: status === 401 ? "anonymous" : status === 403 ? "denied" : "error",
    },
    { status, headers },
  );
/** A verified cookie is the only browser identity. No query/upstream selectors or tokens in JSON. */
export async function stageViewerSession(
  request: NextRequest,
  transport = fetch,
) {
  const config = privateAccessConfig(process.env);
  if (!config || process.env.VQ_STAGE_BUILD_PROFILE !== "combined")
    return fail(404);
  if (request.nextUrl.search) return fail(400);
  if (request.method !== "GET" && request.method !== "POST") return fail(405);
  // This browser endpoint never accepts a conflicting second bearer identity.
  if (request.headers.has("authorization")) return fail(400);
  if (
    request.method === "POST" &&
    (request.headers.get("origin") !== config.origin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  )
    return fail(403);
  const token = stageToken(request);
  if (request.method === "POST") {
    if (token) {
      try {
        const result = await transport(
          `${config.url}/auth/v1/logout?scope=local`,
          {
            method: "POST",
            headers: { apikey: config.key, Authorization: `Bearer ${token}` },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          },
        );
        // 401/403 alone do not prove server-session revocation. Retain retry cookie on failure.
        if (!result.ok) return fail(503);
        // Auth success alone is insufficient: the same token must now fail the live gate.
        if ((await authorizeStageToken(config, token, transport)) !== 403)
          return fail(503);
      } catch {
        return fail(503);
      }
    }
    const response = NextResponse.json({ state: "anonymous" }, { headers });
    const cleared = stageRedirect("/staging/private-access", config);
    response.headers.set("Set-Cookie", cleared.headers.get("Set-Cookie")!);
    return response;
  }
  if (!token) return fail(401);
  const access = await authorizeStageToken(config, token, transport);
  if (access !== 200) return fail(access);
  try {
    const read = async (path: string, method: string) => {
      const r = await transport(config.url + path, {
        method,
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        ...(method === "POST" ? { body: "{}" } : {}),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) throw new Error("Session contract unavailable");
      return r.json();
    };
    const [raw, age, member] = await Promise.all([
      read("/auth/v1/user", "GET"),
      read("/rest/v1/rpc/age_verification_status", "POST"),
      read("/rest/v1/rpc/membership_status", "POST"),
    ]);
    const user = projectViewerUser(raw);
    if (!user) return fail(503);
    if (
      age?.synthetic !== true ||
      age?.verified !== true ||
      member?.allowed !== true
    )
      return fail(403);
    const [finalAge, finalMember] = await Promise.all([
      read("/rest/v1/rpc/age_verification_status", "POST"),
      read("/rest/v1/rpc/membership_status", "POST"),
    ]);
    if (
      finalAge?.synthetic !== true ||
      finalAge?.verified !== true ||
      finalMember?.allowed !== true
    )
      return fail(403);
    const current = await authorizeStageToken(config, token, transport);
    if (current !== 200) return fail(current);
    return NextResponse.json(
      {
        state: "ready",
        session: { user, transport: "httpOnly-stage" },
        age: "verified",
        capabilities: unavailableCapabilities,
      },
      { headers },
    );
  } catch {
    return fail(503);
  }
}
