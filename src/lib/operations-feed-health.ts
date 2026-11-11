import { feedRunHealth, type FeedRun } from "./feed-health";

export const operationsProviders = [
  "ESPN",
  "ESPN injuries",
  "ESPN news",
  "The Odds API",
  "The Odds API props",
  "Editorial result sync",
] as const;
export type OperationsProvider = (typeof operationsProviders)[number];

export const operationsFeedSample = 50;
export const operationsFeedMaxAgeMinutes = 30;

export type OperationsFeedHealth = {
  provider: OperationsProvider;
  status:
    | "current"
    | "stale"
    | "unavailable"
    | "failed"
    | "partial"
    | "no_events"
    | "not_due"
    | "skipped";
  latestAt: string | null;
  lastSuccessAt: string | null;
  stale: boolean;
};

export function summarizeOperationsFeed(
  provider: OperationsProvider,
  runs: FeedRun[],
  now: number,
): OperationsFeedHealth {
  const history = runs
    .filter(
      (row) => row.provider === provider && Date.parse(row.created_at) <= now,
    )
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const maxAge = operationsFeedMaxAgeMinutes * 60_000;
  const result = feedRunHealth(history[0], now, maxAge);
  function isSuccess(row: FeedRun) {
    if (feedRunHealth(row, now, maxAge).state !== "ok") return false;
    // Legacy odds rows without either coverage marker do not establish a refresh.
    return (
      (provider !== "The Odds API" && provider !== "The Odds API props") ||
      row.details?.quoted_markets != null ||
      row.details?.events != null
    );
  }
  const stale = result.timeState === "stale";
  const status =
    result.state === "ok" && history[0] && isSuccess(history[0])
      ? stale
        ? "stale"
        : "current"
      : result.state === "missing" ||
          result.state === "unknown" ||
          result.state === "ok"
        ? "unavailable"
        : result.state;
  return {
    provider,
    status,
    latestAt: history[0]?.created_at ?? null,
    lastSuccessAt: history.find(isSuccess)?.created_at ?? null,
    stale,
  };
}
