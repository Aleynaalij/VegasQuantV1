import { impliedProbability } from "./intelligence";
import { safeSource } from "./research-hub";

export const historyHours = 72;
export const quoteAgeMinutes = 30;
export const bookWindowMinutes = 15;
export const fearSports = ["nfl", "nba", "nhl", "ncaab"] as const;
export type FearSport = (typeof fearSports)[number];
export type FearEvent = {
  id: string;
  sport: FearSport;
  home: string;
  away: string;
  start: string;
  tbd: boolean;
};
export type FearRow = {
  id: string;
  game_id: string;
  kind: string;
  provider: string;
  source: string;
  observed_at: string | null;
  recorded_at: string;
  payload: Record<string, unknown>;
};
export type FearQuote = {
  id: string;
  providerEvent: string;
  provider: string;
  book: string;
  market: string;
  selection: string;
  player: string;
  line: number | null;
  odds: number;
  observed: number;
  received: number;
  source: string;
};
export const markets: Record<string, string> = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Total",
  player_points: "Player points",
  player_rebounds: "Player rebounds",
  player_assists: "Player assists",
  player_threes: "Player threes",
  player_points_rebounds_assists: "Player points + rebounds + assists",
};
export const marketKeys = (sport: FearSport) =>
  sport === "nba" ? Object.keys(markets) : ["h2h", "spreads", "totals"];
const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
const key = (...parts: unknown[]) => JSON.stringify(parts);
const minute = 60_000;

export function fearSource(value: unknown) {
  const safe = safeSource(value);
  if (!safe) return null;
  const url = new URL(safe);
  url.search = "";
  url.hash = "";
  return url.href;
}

export function fearEvidence(event: FearEvent, rows: FearRow[], now: number) {
  const supported = marketKeys(event.sport);
  const snapshots = new Map<string, Map<number, FearQuote[]>>();
  const eventIds = new Set<string>();
  let excluded = 0;
  for (const row of rows) {
    const p = row.payload;
    const market = str(p.market),
      book = str(p.book),
      provider = str(row.provider);
    if (row.game_id !== event.id || !supported.includes(market)) continue;
    const prop = market.startsWith("player_");
    if (row.kind !== (prop ? "prop" : "odds")) continue;
    const providerEvent = str(p.event_id),
      source = fearSource(row.source);
    const observed = Date.parse(row.observed_at || ""),
      received = Date.parse(row.recorded_at);
    if (
      !providerEvent ||
      !source ||
      !book ||
      !provider ||
      !Array.isArray(p.outcomes) ||
      !Number.isFinite(observed) ||
      observed > now ||
      observed < now - historyHours * 60 * minute ||
      !Number.isFinite(received) ||
      received > now ||
      observed >= Date.parse(event.start)
    ) {
      excluded++;
      continue;
    }
    eventIds.add(key(provider, providerEvent));
    const quotes: FearQuote[] = [];
    const choices = new Set<string>();
    let invalid = false;
    for (const value of p.outcomes) {
      const outcome = (value || {}) as Record<string, unknown>;
      const selection = str(outcome.name),
        player = prop ? str(outcome.description) : "";
      const line = market === "h2h" ? null : outcome.point;
      const odds = outcome.price;
      const side =
        prop || market === "totals"
          ? selection === "Over" || selection === "Under"
          : selection === event.home || selection === event.away;
      const choice = key(selection, player);
      if (
        !side ||
        (prop && !player) ||
        (market !== "h2h" &&
          (typeof line !== "number" || !Number.isFinite(line))) ||
        (market === "h2h" && outcome.point != null) ||
        typeof odds !== "number" ||
        !Number.isInteger(odds) ||
        Math.abs(odds) < 100 ||
        Math.abs(odds) > 100000 ||
        choices.has(choice)
      ) {
        invalid = true;
        break;
      }
      choices.add(choice);
      quotes.push({
        id: row.id,
        providerEvent,
        provider,
        book,
        market,
        selection,
        player,
        line: line as number | null,
        odds,
        observed,
        received,
        source,
      });
    }
    const streamKey = key(provider, providerEvent, book, market);
    const stream = snapshots.get(streamKey) || new Map<number, FearQuote[]>();
    const old = stream.get(observed);
    if (
      invalid ||
      (old &&
        key(
          old.map((q) => key(q.selection, q.player, q.line, q.odds)).sort(),
        ) !==
          key(
            quotes
              .map((q) => key(q.selection, q.player, q.line, q.odds))
              .sort(),
          ))
    ) {
      excluded++;
      stream.set(observed, []);
    } else if (!old || (old.length && received < old[0].received)) {
      stream.set(observed, quotes);
    }
    snapshots.set(streamKey, stream);
  }

  const tapes = [];
  const comparable = new Map<string, FearQuote[]>();
  // Reject ambiguous provider-event mappings rather than splice separate games.
  if (eventIds.size > 1)
    return { tapes: [], dispersion: [], excluded, ambiguous: true };
  for (const snapshotsByTime of snapshots.values()) {
    const times = [...snapshotsByTime.keys()].sort((a, b) => a - b);
    const latest = snapshotsByTime.get(times[times.length - 1]) || [];
    for (const quote of latest) {
      const history = times.flatMap((time) =>
        (snapshotsByTime.get(time) || []).filter(
          (q) => q.selection === quote.selection && q.player === quote.player,
        ),
      );
      const first = history[0];
      tapes.push({
        first,
        latest: quote,
        observations: history.length,
        stale: now - quote.observed > quoteAgeMinutes * minute,
      });
      if (now - quote.observed > quoteAgeMinutes * minute) continue;
      const group = key(
        quote.provider,
        quote.providerEvent,
        quote.market,
        quote.selection,
        quote.player,
        quote.line,
      );
      const offers = comparable.get(group) || [];
      offers.push(quote);
      comparable.set(group, offers);
    }
  }
  const dispersion = [...comparable.values()].flatMap((offers) => {
    const newest = Math.max(...offers.map((q) => q.observed));
    const quotes = offers
      .filter((q) => newest - q.observed <= bookWindowMinutes * minute)
      .sort((a, b) => impliedProbability(a.odds) - impliedProbability(b.odds));
    return quotes.length >= 2
      ? [{ quotes, low: quotes[0], high: quotes[quotes.length - 1] }]
      : [];
  });
  return { tapes, dispersion, excluded, ambiguous: false };
}
