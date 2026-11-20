/** UI selection only. Existing data authorization and RLS remain authoritative. */
type Environment = Record<string, string | undefined>;
const productionUrl = "https://uowearboulykfcwnuirn.supabase.co";
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const zero = "00000000-0000-0000-0000-000000000000";

export function productionOwnerConfig(env: Environment) {
  if (
    env.VERCEL_ENV !== "production" ||
    !["owners", "optin", "default"].includes(env.HOME2_PRODUCTION || "") ||
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
    /**
     * "owners": owner preview only. "optin": paying members may choose the new Home.
     * "default": every signed-in account gets the new Home first and may go back to classic.
     */
    mode: env.HOME2_PRODUCTION as "owners" | "optin" | "default",
  };
}

const jwtShape = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/**
 * Eligibility for a non-owner. Mode "optin": a paying member. Mode "default": any account the Auth
 * server confirms (signed in, email confirmed, not anonymous, not banned or deleted).
 * Opt-in detail: a paying member. The pinned Auth server validates the
 * token, then the database's own membership_status() is asked with that token. Trials do not
 * count (Mike: paying members only); complimentary premium does. UI selection only: RLS still
 * decides every read.
 */
export async function verifyProductionMember(
  env: Environment,
  token: string | null,
  request: typeof fetch = fetch,
  now = Date.now(),
) {
  const config = productionOwnerConfig(env);
  if (
    !config ||
    config.mode === "owners" ||
    !token ||
    token.length > 4096 ||
    !jwtShape.test(token)
  )
    return false;
  try {
    const claims = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    );
    if (
      typeof claims.sub !== "string" ||
      !uuid.test(claims.sub) ||
      claims.role !== "authenticated" ||
      claims.is_anonymous === true ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp * 1000 <= now
    )
      return false;
    const headers = { apikey: config.key, Authorization: `Bearer ${token}` };
    const userResponse = await request(`${config.url}/auth/v1/user`, {
      headers,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!userResponse.ok) return false;
    const user = await userResponse.json();
    if (
      user?.id !== claims.sub ||
      user.is_anonymous !== false ||
      typeof user.email_confirmed_at !== "string" ||
      user.deleted_at ||
      (user.banned_until && Date.parse(user.banned_until) > now)
    )
      return false;
    // Default-on: any confirmed account (Mike: "everyone who has a current account").
    if (config.mode === "default") return true;
    const status = await request(
      `${config.url}/rest/v1/rpc/membership_status`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!status.ok) return false;
    const m = await status.json();
    return m?.allowed === true && m.trial_active !== true;
  } catch {
    return false;
  }
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

/**
 * The production domains, plus the project's own production alias on vercel.app: members who added
 * the app to their home screen from that address run it there, and would otherwise always get
 * classic. Preview and other vercel.app hosts stay rejected.
 */
const productionOrigins = [
  "https://vegasquant.app",
  "https://www.vegasquant.app",
  "https://vegas-quant-v1.vercel.app",
];

export async function productionOwnerResponse(
  req: Request,
  env: Environment,
  request: typeof fetch = fetch,
) {
  // enabled: the owner preview (always on). eligible: may choose the new Home (owners, and in
  // "optin" mode paying members). Dark (404) and rejected (403) replies stay exactly
  // {enabled:false}: they disclose nothing new.
  // preferred: the new experience is the starting point (mode "default"); a member who chose
  // classic on this device stays on classic.
  const preferred = productionOwnerConfig(env)?.mode === "default";
  const reply = (enabled: boolean, status = 200, eligible?: boolean) =>
    Response.json(
      eligible === undefined
        ? { enabled }
        : { enabled, eligible, preferred: eligible && preferred },
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
    !productionOrigins.includes(url.origin) ||
    req.headers.get("origin") !== url.origin
  )
    return reply(false, 403);
  const token =
    req.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1] ?? null;
  if (await verifyProductionOwner(env, token, request))
    return reply(true, 200, true);
  return reply(false, 200, await verifyProductionMember(env, token, request));
}
