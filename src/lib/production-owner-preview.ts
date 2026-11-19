/** UI selection only. Existing data authorization and RLS remain authoritative. */
type Environment = Record<string, string | undefined>;
const productionUrl = "https://uowearboulykfcwnuirn.supabase.co";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const zero = "00000000-0000-0000-0000-000000000000";

export function productionOwnerConfig(env: Environment) {
  if (
    env.VERCEL_ENV !== "production" ||
    env.HOME2_PRODUCTION !== "owners" ||
    env.VQ_COMBINED_STAGE_BUILD === "1" ||
    env.STAGING_DISCOVERY_ENABLED === "true" ||
    env.VQ_STAGE_BUILD_PROFILE !== undefined ||
    (env.NEXT_PUBLIC_SUPABASE_URL || productionUrl) !== productionUrl ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "",
    )
  )
    return null;
  const owners = (env.HOME2_OWNER_IDS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  if (
    owners.length < 1 ||
    owners.length > 2 ||
    new Set(owners).size !== owners.length ||
    owners.some((id) => !uuid.test(id) || id === zero)
  )
    return null;
  return {
    url: productionUrl,
    key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    owners,
  };
}

/** No cookie, URL, query, body, email or user_metadata selects the audience. */
export async function verifyProductionOwner(
  env: Environment,
  token: string | null,
  request: typeof fetch = fetch,
  now = Date.now(),
) {
  const config = productionOwnerConfig(env);
  if (
    !config ||
    !token ||
    token.length > 4096 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
  )
    return false;
  try {
    // Claims are only an untrusted prefilter until the pinned Auth server validates
    // the token and its session. No local JWT decoding authenticates a caller.
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (
      typeof claims.sub !== "string" ||
      !config.owners.includes(claims.sub) ||
      claims.aal !== "aal2" ||
      claims.role !== "authenticated" ||
      claims.is_anonymous === true ||
      typeof claims.session_id !== "string" ||
      !uuid.test(claims.session_id) ||
      claims.session_id === zero ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now
    )
      return false;
    const response = await request(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.key, Authorization: `Bearer ${token}` },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const user = await response.json();
    return (
      user?.id === claims.sub &&
      user.is_anonymous === false &&
      typeof user.email_confirmed_at === "string" &&
      Number.isFinite(Date.parse(user.email_confirmed_at)) &&
      !user.deleted_at &&
      (!user.banned_until || Date.parse(user.banned_until) <= now)
    );
  } catch {
    return false;
  }
}

export async function productionOwnerResponse(
  req: Request,
  env: Environment,
  request: typeof fetch = fetch,
) {
  const reply = (enabled: boolean, status = 200) =>
    Response.json(
      { enabled },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store",
          Vary: "Authorization, Origin",
          "X-Robots-Tag": "noindex",
        },
      },
    );
  if (!productionOwnerConfig(env)) return reply(false, 404);
  const url = new URL(req.url);
  if (
    req.method !== "POST" ||
    !["https://vegasquant.app", "https://www.vegasquant.app"].includes(
      url.origin,
    ) ||
    req.headers.get("origin") !== url.origin
  )
    return reply(false, 403);
  const token =
    req.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? null;
  return reply(await verifyProductionOwner(env, token, request));
}
