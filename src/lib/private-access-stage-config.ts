export const PRIVATE_ACCESS_TARGET = "atlas-private-access";
export const PRIVATE_ACCESS_PATH = "/staging/private-access";

type Environment = Record<string, string | undefined>;

const forbiddenCredentials = [
  /^(?:STRIPE_|NEXT_PUBLIC_STRIPE_|SPORTRADAR_|SPORTSRADAR_|RESEND_|NOTIFICATION_EMAIL_)/,
  /^(?:SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|DB_.*|ACCESS_TOKEN)|DATABASE_URL|POSTGRES_.*|VAPID_.*)$/,
];

export function isPrivateAccessCandidate(env: Environment): boolean {
  if (env.VERCEL_ENV === "production") return false;
  return env.VERCEL === "1" || env.VERCEL_ENV === "preview" ||
    env.VERCEL_TARGET_ENV !== undefined || env.VQ_PRIVATE_ACCESS_PROJECT_REF !== undefined ||
    env.VERCEL_GIT_COMMIT_REF === "codex/private-development-transition";
}

export function privateAccessConfig(env: Environment) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_TARGET_ENV !== PRIVATE_ACCESS_TARGET) return null;

  const ref = env.VQ_PRIVATE_ACCESS_PROJECT_REF;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const host = env.VERCEL_URL;
  if (ref !== "caynldluziwrzmvuslzg" ||
      url !== `https://${ref}.supabase.co` ||
      !key || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) ||
      !host || !/^[a-z0-9-]+\.vercel\.app$/.test(host) ||
      env.BILLING_ENABLED !== "false" || env.LIVE_SCORES_DISABLED !== "1" ||
      env.AGE_VERIFICATION_ENABLED !== "false" ||
      env.VQ_PUBLICATION_PREVIEW_LIVE_ENABLED === "true" ||
      Object.keys(env).some((name) => env[name] && forbiddenCredentials.some((pattern) => pattern.test(name)))) {
    return null;
  }
  return { url, key, origin: `https://${host}` };
}
