import { discoveryStagingEnabled } from "./discovery/access";
/** Candidate selection, NOT authorization. Production remains explicitly excluded until CEO release. */
export function consumerExperienceEnabled(
  env: Record<string, string | undefined>,
) {
  return env.CONSUMER_UI_ENABLED === "true" && discoveryStagingEnabled(env);
}
export type ConsumerQuery = Record<string, string | string[] | undefined>;
export function legacyGameDestination(query: ConsumerQuery) {
  if (!Object.hasOwn(query, "game")) return null;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    for (const item of Array.isArray(value)
      ? value
      : value === undefined
        ? []
        : [value])
      params.append(key, item);
  return `/nfl?${params.toString()}#home-games`;
}
export function legacyLayDestination(query: ConsumerQuery) {
  if (!Object.hasOwn(query, "build") && !Object.hasOwn(query, "saved"))
    return null;
  const saved = typeof query.saved === "string" ? query.saved : "";
  return saved
    ? `/parlays?saved=${encodeURIComponent(saved)}#my-parlay-${encodeURIComponent(saved)}`
    : "/parlays";
}
