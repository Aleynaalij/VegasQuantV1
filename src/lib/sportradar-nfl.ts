import { createHash } from "node:crypto";

export type SportradarConfig = { key?: string; enabled?: string; access?: string };
export const sportradarConfig = (): SportradarConfig => ({
  // Accept the owner’s existing secret name without retrieving or copying its value.
  key: process.env.SPORTRADAR_API_KEY || process.env.SPORTSRADAR_API_KEY,
  enabled: process.env.SPORTRADAR_NFL_ENABLED,
  access: process.env.SPORTRADAR_ACCESS_LEVEL,
});
export function sportradarStatus(config: SportradarConfig) {
  const blockers = [
    ...(!config.key ? ["SPORTRADAR_API_KEY is missing"] : []),
    ...(config.enabled !== "true" ? ["SPORTRADAR_NFL_ENABLED is not enabled"] : []),
    ...(!["trial", "production"].includes(config.access || "") ? ["Choose the key's SPORTRADAR_ACCESS_LEVEL: trial or production"] : []),
  ];
  return { provider: "Sportradar NFL v7", status: blockers.length ? "not_configured" : "ready_to_verify", access: ["trial", "production"].includes(config.access || "") ? config.access : null, blockers, live_verified: false };
}
export class SportradarError extends Error {
  constructor(public code: string) { super(code); }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Keep private preview responses below the hosting response limit, including evidence metadata.
const LIMIT = 3 * 1024 * 1024;
/** Manual admin preview only. No polling, publishing, result grading or provider-ID guessing. */
async function fetchDocument(
  config: SportradarConfig,
  sourceUrl: string,
  fetcher: typeof fetch = fetch,
) {
  if (sportradarStatus(config).blockers.length) throw new SportradarError("not_configured");
  let response: Response;
  try {
    response = await fetcher(sourceUrl, {
      headers: { "x-api-key": config.key!, Accept: "application/json" },
      signal: AbortSignal.timeout(12000), redirect: "error", cache: "no-store",
    });
  } catch { throw new SportradarError("provider_unreachable"); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new SportradarError(response.status === 429 ? "provider_rate_limited" : [401, 403].includes(response.status) ? "provider_access_denied" : "provider_request_failed");
  }
  if (!response.headers.get("content-type")?.includes("json") || !response.body) {
    await response.body?.cancel();
    throw new SportradarError("provider_schema_unverified");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > LIMIT) { await reader.cancel(); throw new SportradarError("provider_response_too_large"); }
      chunks.push(value);
    }
  } catch (error) {
    throw error instanceof SportradarError ? error : new SportradarError("provider_unreachable");
  }
  const bytes = Buffer.concat(chunks);
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(bytes.toString("utf8")); } catch { throw new SportradarError("provider_schema_unverified"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SportradarError("provider_schema_unverified");
  return {
    provider: "Sportradar NFL v7", access: config.access, source_url: sourceUrl,
    retrieved_at: new Date().toISOString(),
    provider_last_modified: response.headers.get("last-modified"),
    provider_date: response.headers.get("date"),
    provider_generated_at: null,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    payload,
    limitations: ["Manual private preview; not a durable source observation or published selection", "Receipt time does not prove event freshness; validate clocks, corrections and game mapping", "Trial entitlement and commercial display rights must be confirmed before public use", "No sportsbook odds, clearance, forecasts or result grading are inferred"],
  };
}

export async function fetchSportradarGame(config: SportradarConfig, gameId: string, feed: "statistics" | "pbp", fetcher: typeof fetch = fetch) {
  if (!UUID.test(gameId) || !["statistics", "pbp"].includes(feed)) throw new SportradarError("invalid_request");
  const result = await fetchDocument(config, `https://api.sportradar.com/nfl/official/${config.access}/v7/en/games/${gameId}/${feed}.json`, fetcher);
  if (result.payload.id !== gameId || typeof result.payload.status !== "string") throw new SportradarError("provider_game_identity_unverified");
  return { ...result, game_id: gameId, feed };
}
export async function fetchSportradarCurrentWeek(config: SportradarConfig, fetcher: typeof fetch = fetch) {
  return fetchDocument(config, `https://api.sportradar.com/nfl/official/${config.access}/v7/en/games/current_week/schedule.json`, fetcher);
}
