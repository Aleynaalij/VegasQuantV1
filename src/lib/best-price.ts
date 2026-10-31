/**
 * Best price across sportsbooks (owner, Oct 31 2026). One exact selection (game, market, player,
 * side, line) is compared across books; a different line is a different bet and never "better".
 * Only quotes with a known, recent, non-future observation time compete, newest per book.
 */
export const BOOKS = [
  "FanDuel",
  "DraftKings",
  "BetMGM",
  "Caesars",
  "BetRivers",
  "Fanatics",
] as const;

export type BookQuote = { book: string; price: number; observedAt: string };

export type QuoteRow = {
  game_id: string;
  observed_at: string | null;
  payload: {
    book?: string;
    market?: string;
    provider_updated_at?: string;
    outcomes?: {
      name?: string;
      description?: string;
      point?: number;
      price?: number;
    }[];
  } | null;
};

const CLOCK_SKEW_MS = 5 * 60000;
/** Prices move: only the last hour of quotes competes for "Best". */
export const BEST_MAX_AGE_MS = 60 * 60000;

/** Bigger payout wins: compare American odds by their decimal value. */
export const decimalOdds = (price: number) =>
  price > 0 ? 1 + price / 100 : 1 + 100 / -price;

export const validPrice = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && Math.abs(n) >= 100;

/** "Kevin Durant", "kevin durant", "Kevin Durant Jr." are one player; anything else is not. */
export const playerKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)$/, "")
    .replace(/\s+/g, " ")
    .trim();

export function selectionKey(
  gameId: string,
  market: string,
  player: string,
  side: string,
  point: number | null,
) {
  return JSON.stringify([
    gameId,
    market.replace(/_alternate$/, ""),
    player ? playerKey(player) : "",
    side.toLowerCase(),
    point,
  ]);
}

/**
 * Every book's newest current quote per exact selection. `maxAgeMs` is the sport's freshness policy;
 * undated, future-stamped or older quotes are left out, never shown as current.
 */
export function bookQuotes(rows: QuoteRow[], now: number, maxAgeMs: number) {
  const out = new Map<string, Map<string, BookQuote>>();
  for (const r of rows) {
    const book = r.payload?.book || "";
    const market = r.payload?.market || "";
    if (!(BOOKS as readonly string[]).includes(book) || !market) continue;
    const at = r.observed_at || r.payload?.provider_updated_at || "";
    const t = Date.parse(at);
    if (!Number.isFinite(t) || t > now + CLOCK_SKEW_MS || now - t > maxAgeMs)
      continue;
    for (const o of r.payload?.outcomes || []) {
      if (!o?.name || !validPrice(o.price)) continue;
      const point =
        typeof o.point === "number" && Number.isFinite(o.point)
          ? o.point
          : null;
      const key = selectionKey(
        r.game_id,
        market,
        o.description || "",
        o.name,
        point,
      );
      const books = out.get(key) || new Map<string, BookQuote>();
      const held = books.get(book);
      if (!held || Date.parse(held.observedAt) < t)
        books.set(book, { book, price: o.price, observedAt: at });
      out.set(key, books);
    }
  }
  return out;
}

export type BestPrice = { best: BookQuote; books: number; quotes: BookQuote[] };

/** The best current price for one selection, or null with fewer than `min` books quoting it. */
export function bestPrice(
  quotes: Map<string, Map<string, BookQuote>>,
  key: string,
  min = 2,
): BestPrice | null {
  const list = [...(quotes.get(key)?.values() || [])].sort(
    (a, b) =>
      decimalOdds(b.price) - decimalOdds(a.price) ||
      BOOKS.indexOf(a.book as never) - BOOKS.indexOf(b.book as never),
  );
  return list.length >= min
    ? { best: list[0], books: list.length, quotes: list }
    : null;
}

/**
 * A recent book paying more than the price on screen for the identical line. The shown price is
 * the comparison, so one recent quote is enough even when the shown quote has aged out.
 */
export function beats(
  quotes: Map<string, Map<string, BookQuote>>,
  key: string,
  shown: number | null | undefined,
): BookQuote | null {
  const b = bestPrice(quotes, key, 1);
  if (!b || !validPrice(shown)) return null;
  return decimalOdds(b.best.price) > decimalOdds(shown) ? b.best : null;
}
