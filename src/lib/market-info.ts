// Exact reviewed informational destinations only; no redirects or wager parameters.
export const marketInfoUrls = [
  "https://www.espn.com/nfl/odds",
  "https://www.scoresandodds.com/nfl/odds",
  "https://www.covers.com/sport/football/nfl/odds",
] as const;
export function isMarketInfoUrl(value: unknown): value is string {
  return (
    typeof value === "string" && marketInfoUrls.some((url) => url === value)
  );
}
