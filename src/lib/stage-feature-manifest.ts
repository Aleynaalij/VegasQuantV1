import { featureCapabilities, noFeatures } from "./stage-feature-query";
import type { privateAccessConfig } from "./private-access-stage-config";
/** Same session, fixed isolated backend; never infer readiness from UI configuration. */
export async function stageFeatureManifest(
  config: NonNullable<ReturnType<typeof privateAccessConfig>>,
  token: string,
  transport = fetch,
) {
  if (process.env.VQ_STAGE_FEATURE_CONTRACT !== "vq-stage-features-v1")
    return noFeatures;
  try {
    const r = await transport(
      `${config.url}/rest/v1/rpc/vq_private_access_stage_features`,
      {
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
      },
    );
    return r.ok
      ? (featureCapabilities(await r.json()) ?? noFeatures)
      : noFeatures;
  } catch {
    return noFeatures;
  }
}
