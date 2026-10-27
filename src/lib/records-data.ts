// Shared data for the Records cards (Profit at published prices, Research board record, Beat the
// close). Each card used to download the same published legs and closing prices on its own, some
// with up to 2,000 leg keys in a single URL. These load once, are cached for a minute, and are
// shared; recent form comes from the batched leg-data loader.
import { supabase } from "./supabase";
import { memo } from "./batch";
import type { PricedLeg, TrackedPrice } from "./priced-record";

async function pages<T>(page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from);
    if (r.error) throw r.error;
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) return out;
  }
}

/** Every published leg (newest first), in stable pages. */
export const publishedLegs = memo(
  () =>
    pages<PricedLeg>((from) =>
      supabase
        .from("published_legs")
        .select("leg_key,kind,name,market,matchup,game_id,published_at,result,result_source,odds,original_leg_key")
        .order("published_at", { ascending: false })
        .order("leg_key")
        .range(from, from + 999) as unknown as PromiseLike<{ data: PricedLeg[] | null; error: unknown }>,
    ),
  60000,
);

/** First and closing price per leg, for every tracked leg whose game has kicked off. */
export const closingPrices = memo(async () => {
  const cutoff = new Date().toISOString();
  const rows = await pages<{ leg_key: string; first_price: number; last_price: number }>((from) =>
    supabase
      .from("leg_market_prices")
      .select("leg_key,first_price,last_price")
      .lt("kickoff", cutoff)
      .order("leg_key")
      .range(from, from + 999) as unknown as PromiseLike<{ data: { leg_key: string; first_price: number; last_price: number }[] | null; error: unknown }>,
  );
  return new Map<string, TrackedPrice>(rows.map((p) => [p.leg_key, { first: Number(p.first_price), last: Number(p.last_price) }]));
}, 60000);

export function resetRecordsData() {
  publishedLegs.reset();
  closingPrices.reset();
}
