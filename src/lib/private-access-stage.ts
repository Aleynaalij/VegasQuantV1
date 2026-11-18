import { stageConsumerRoute } from "./stage-route-policy";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import {
  PRIVATE_ACCESS_PATH,
  privateAccessConfig,
} from "./private-access-stage-config";

type StageConfig = NonNullable<ReturnType<typeof privateAccessConfig>>;

const cookieName = "__Host-vq-private-access";
const boundaryHeaders = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

const noStore = { "Cache-Control": "private, no-store" };

export function stageResponse(
  body: string | null,
  status = 200,
  type = "text/plain",
) {
  return new NextResponse(body, {
    status,
    headers: { ...boundaryHeaders, "Content-Type": `${type}; charset=utf-8` },
  });
}

export function stageToken(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token =
    authorization === null
      ? request.cookies.get(cookieName)?.value
      : /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  return token && token.length <= 3800 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)
    ? token
    : null;
}

export function stageRedirect(
  path: string,
  config: StageConfig,
  token?: string,
) {
  const response = NextResponse.redirect(new URL(path, config.origin), {
    status: 303,
    headers: boundaryHeaders,
  });
  const options = {
    name: cookieName,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "strict" as const,
  };
  response.cookies.set({
    ...options,
    value: token ?? "",
    maxAge: token ? 900 : 0,
  });
  return response;
}

export async function signInStage(
  config: StageConfig,
  email: string,
  password: string,
  code: string,
) {
  const db = createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(6000) }),
    },
  });
  const result = await db.auth.signInWithPassword({ email, password });
  if (!result.data.session || result.error) return null;
  if (!code) return result.data.session.access_token;
  const factors = await db.auth.mfa.listFactors();
  const factor = factors.data?.totp[0];
  if (factors.error || !factor) return null;
  const verified = await db.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  });
  return verified.error ? null : verified.data.access_token;
}

async function authorizedStageRpc(
  config: StageConfig,
  token: string,
  rpc: "vq_private_access_stage_read" | "vq_private_access_stage_authorized",
  request: typeof fetch,
): Promise<{ status: 200; payload: unknown } | { status: 403 | 503 }> {
  try {
    const response = await request(`${config.url}/rest/v1/rpc/${rpc}`, {
      method: "POST",
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 401 || response.status === 403)
      return { status: 403 as const };
    if (!response.ok) return { status: 503 as const };
    return { status: 200, payload: await response.json() };
  } catch {
    return { status: 503 };
  }
}

export async function authorizeStageToken(
  config: StageConfig,
  token: string,
  request = fetch,
): Promise<200 | 403 | 503> {
  const result = await authorizedStageRpc(
    config,
    token,
    "vq_private_access_stage_authorized",
    request,
  );
  if (result.status !== 200) return result.status;
  return result.payload === true ? 200 : result.payload === false ? 403 : 503;
}

export async function readStageRecords(
  config: StageConfig,
  token: string | null,
  request = fetch,
) {
  if (!token) return { status: 401 as const };
  const result = await authorizedStageRpc(
    config,
    token,
    "vq_private_access_stage_read",
    request,
  );
  if (result.status !== 200) return result;
  if (result.payload === null) return { status: 403 as const };
  if (
    !Array.isArray(result.payload) ||
    !result.payload.every((value) => typeof value === "string")
  ) {
    return { status: 503 as const };
  }
  return { status: 200 as const, records: result.payload as string[] };
}

export async function checkCombinedStageRequest(request: NextRequest) {
  const config = privateAccessConfig(process.env);
  if (!config || process.env.VQ_STAGE_BUILD_PROFILE !== "combined")
    return stageResponse(null, 404);

  const path = request.nextUrl.pathname;
  // The gate's handlers apply their own method, origin and authorization checks.
  if (
    path === PRIVATE_ACCESS_PATH ||
    path === `${PRIVATE_ACCESS_PATH}/records` ||
    path === `/api${PRIVATE_ACCESS_PATH}`
  )
    return null;

  if (
    path === "/staging/discovery/session" ||
    path === "/staging/discovery/data" ||
    /^\/staging\/discovery\/read\/(?:dealer|research)$/.test(path)
  )
    return null;

  if (request.method !== "GET" && request.method !== "HEAD")
    return stageResponse(null, 405);
  // Deny unreviewed endpoints, including legacy side-effect APIs and Next image
  // optimization, even for an authorized staging owner.
  if (!stageConsumerRoute(path)) return stageResponse(null, 404);

  const token = stageToken(request);
  if (!token)
    return NextResponse.redirect(new URL(PRIVATE_ACCESS_PATH, config.origin), {
      status: 303,
      headers: noStore,
    });
  const result = await authorizedStageRpc(
    config,
    token,
    "vq_private_access_stage_authorized",
    fetch,
  );
  if (result.status !== 200) return stageResponse(null, result.status);
  if (result.payload === false) return stageResponse(null, 403);
  if (result.payload !== true) return stageResponse(null, 503);
  return null;
}

export async function signOutStage(config: StageConfig, token: string | null) {
  if (token) {
    const result = await fetch(`${config.url}/auth/v1/logout?scope=local`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    if (!result?.ok || (await authorizeStageToken(config, token)) !== 403)
      return stageResponse(
        "Sign-out could not be verified. Please retry.",
        503,
      );
  }
  return stageRedirect(PRIVATE_ACCESS_PATH, config);
}

export function stagePage(title: string, content: string, status = 200) {
  return stageResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1>${content}</main></body></html>`,
    status,
    "text/html",
  );
}

export function escapeStageHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
