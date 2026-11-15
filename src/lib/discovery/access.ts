/** Server-only release gate. A URL/query/cookie cannot enable this candidate. */
export function discoveryStagingEnabled(
  env: Record<string, string | undefined>,
) {
  if (
    env.VERCEL_ENV === "production" ||
    env.STAGING_DISCOVERY_ENABLED !== "true"
  )
    return false;
  try {
    const u = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".supabase.co") &&
      u.hostname !== "uowearboulykfcwnuirn.supabase.co" &&
      !u.username &&
      !u.password &&
      env.STAGING_DISCOVERY_PROJECT === u.hostname.split(".")[0]
    );
  } catch {
    return false;
  }
}
