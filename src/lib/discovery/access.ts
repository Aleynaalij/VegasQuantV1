/** Server-only release gate. A URL/query/cookie cannot enable this candidate. */
import { privateAccessConfig } from "../private-access-stage-config";

export function discoveryStagingEnabled(
  env: Record<string, string | undefined>,
) {
  if (
    env.VERCEL_ENV === "production" ||
    env.STAGING_DISCOVERY_ENABLED !== "true" ||
    (env.VERCEL === "1" &&
      (env.VQ_STAGE_BUILD_PROFILE !== "combined" || !privateAccessConfig(env))) ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
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

/** Presentation-only deny suspension, never an owner/authentication decision. */
export function discoveryShellSuspended(enabled: boolean, pathname: string) {
  return enabled && pathname === "/staging/discovery/access-denied";
}
