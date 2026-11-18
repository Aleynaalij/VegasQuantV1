export const PRIVATE_ACCESS_TARGET = "atlas-private-access";
export const PRIVATE_ACCESS_PATH = "/staging/private-access";
const STAGE_SUPABASE_REF = "caynldluziwrzmvuslzg";
export const STAGE_SUPABASE_URL = `https://${STAGE_SUPABASE_REF}.supabase.co`;

type Environment = Record<string, string | undefined>;

const forbiddenCredentials = [
  /^(?:STRIPE_|NEXT_PUBLIC_STRIPE_|SPORTRADAR_|SPORTSRADAR_|RESEND_|NOTIFICATION_EMAIL_)/,
  /^(?:SUPABASE_(?:SERVICE_ROLE_KEY|SECRET_KEY|DB_.*|ACCESS_TOKEN)|DATABASE_URL|POSTGRES_.*|VAPID_.*)$/,
  /^(?:SUPABASE_(?:URL|ANON_KEY)|NEXT_PUBLIC_SUPABASE_ANON_KEY|APP_URL|.*(?:DISPATCH|WEBHOOK|COLLECTOR)_(?:URL|TOKEN|SECRET))$/,
];

export type StageBuildProfile =
  | "standard"
  | "consumer-fixture"
  | "gate"
  | "combined";

export function stageBuildProfile(env: Environment): StageBuildProfile {
  if (env.VERCEL_ENV === "production") return "standard";
  const profile = env.VQ_STAGE_BUILD_PROFILE;
  if (
    profile === "consumer-fixture" &&
    env.CI === "true" &&
    env.VERCEL === undefined &&
    env.VERCEL_ENV === "preview" &&
    env.VERCEL_TARGET_ENV === undefined &&
    env.VQ_PRIVATE_ACCESS_PROJECT_REF === undefined &&
    env.STAGING_DISCOVERY_PROJECT === "synthetic" &&
    env.NEXT_PUBLIC_SUPABASE_URL === "https://synthetic.supabase.co" &&
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY === "synthetic-public-fixture"
  ) {
    return profile;
  }
  if (profile === "gate" || profile === "combined") {
    if (privateAccessConfig(env)) return profile;
  }
  if (
    profile !== undefined ||
    env.VERCEL_TARGET_ENV === PRIVATE_ACCESS_TARGET ||
    env.VQ_PRIVATE_ACCESS_PROJECT_REF !== undefined ||
    [
      "codex/atlas-combined-stage",
      "codex/atlas-final-integration",
      "codex/atlas-authenticated-experience",
      "codex/atlas-feature-preservation",
      "elo/atlas-consumer-reader-ci",
    ].includes(env.VERCEL_GIT_COMMIT_REF ?? "") ||
    (env.VERCEL === "1" &&
      (env.STAGING_DISCOVERY_ENABLED === "true" ||
        env.CONSUMER_UI_ENABLED === "true"))
  ) {
    throw new Error(
      "Invalid or incomplete isolated staging build configuration.",
    );
  }
  return "standard";
}

export function privateAccessConfig(env: Environment) {
  const profile = env.VQ_STAGE_BUILD_PROFILE;
  if (
    env.VERCEL !== "1" ||
    env.VERCEL_ENV !== "preview" ||
    env.VERCEL_TARGET_ENV !== PRIVATE_ACCESS_TARGET ||
    (profile !== "gate" && profile !== "combined")
  )
    return null;

  const ref = env.VQ_PRIVATE_ACCESS_PROJECT_REF;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const host = env.VERCEL_URL;
  if (
    ref !== STAGE_SUPABASE_REF ||
    url !== STAGE_SUPABASE_URL ||
    !key ||
    !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) ||
    !host ||
    !/^[a-z0-9-]+\.vercel\.app$/.test(host) ||
    env.BILLING_ENABLED !== "false" ||
    env.LIVE_SCORES_DISABLED !== "1" ||
    env.AGE_VERIFICATION_ENABLED !== "false" ||
    env.VQ_PUBLICATION_PREVIEW_LIVE_ENABLED !== "false" ||
    Object.keys(env).some(
      (name) =>
        env[name] && forbiddenCredentials.some((pattern) => pattern.test(name)),
    )
  ) {
    return null;
  }
  if (
    profile === "combined" &&
    (env.STAGING_DISCOVERY_PROJECT !== ref ||
      (env.STAGING_DISCOVERY_FIXTURES !== "true" &&
        !(
          env.STAGING_DISCOVERY_FIXTURES === "false" &&
          env.VQ_STAGE_RESEARCH_CONTRACT === "vq-stage-session-v1"
        )) ||
      env.STAGING_DISCOVERY_LINKED_PUBLICATIONS !== "false" ||
      !["true", "false"].includes(env.STAGING_DISCOVERY_ENABLED ?? "") ||
      !["true", "false"].includes(env.CONSUMER_UI_ENABLED ?? ""))
  )
    return null;
  return { url, key, origin: `https://${host}` };
}
