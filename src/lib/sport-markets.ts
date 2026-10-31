import type { SportMarket, NewSport } from "./sport-contract";
export { allowedMarkets } from "../../supabase/functions/sports-sync/normalize";
/** Preserve the whole quote identity. Never reinterpret a displayed threshold. */
export const sportMarketKey = (
  m: Pick<
    SportMarket,
    | "sport"
    | "game_id"
    | "book"
    | "market"
    | "selection"
    | "direction"
    | "line"
    | "settlement"
  >,
) =>
  JSON.stringify([
    m.sport,
    m.game_id,
    m.book,
    m.market,
    m.selection,
    m.direction,
    m.line,
    m.settlement,
  ]);
export function latestSportMarkets(
  markets: SportMarket[],
  sport: NewSport,
  now = Date.now(),
) {
  const seen = new Set<string>();
  return [...markets]
    .filter((m) => m.sport === sport)
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .filter((m) => {
      const k = sportMarketKey(m);
      if (seen.has(k)) return false;
      seen.add(k);
      return Date.parse(m.observed_at) <= now && Date.parse(m.expires_at) > now;
    });
}
