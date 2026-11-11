import type { OperationsRelease } from "./operations-support";

export function observeOperationsRelease(
  env: Readonly<Record<string, string | undefined>> = process.env,
  now = new Date(),
): OperationsRelease | null {
  const environment = env.VERCEL_ENV;
  const deploymentId = env.VERCEL_DEPLOYMENT_ID;
  if (
    env.VERCEL !== "1" ||
    (environment !== "production" && environment !== "preview") ||
    !deploymentId ||
    !/^dpl_[A-Za-z0-9]{8,80}$/.test(deploymentId)
  )
    return null;

  const sha = env.VERCEL_GIT_COMMIT_SHA;
  const commit =
    env.VERCEL_GIT_PROVIDER === "github" &&
    env.VERCEL_GIT_REPO_OWNER?.toLowerCase() === "aleynaalij" &&
    env.VERCEL_GIT_REPO_SLUG?.toLowerCase() === "vegasquantv1" &&
    sha &&
    /^[a-f0-9]{40}$/.test(sha)
      ? sha
      : null;

  return { environment, deploymentId, commit, observedAt: now.toISOString() };
}
