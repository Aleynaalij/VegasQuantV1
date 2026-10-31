import { NextResponse } from "next/server";
import { serviceDb } from "@/lib/billing-server";
import { homeRecord } from "@/lib/track-record";
import type { PricedLeg, TrackedPrice } from "@/lib/priced-record";

export const runtime = "nodejs";
// The record changes when picks settle; ten minutes is fresh enough for Home and spares the database.
export const revalidate = 600;

async function pages<T>(
  page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await page(from);
    if (r.error) throw r.error;
    out.push(...(r.data || []));
    if ((r.data || []).length < 1000) return out;
  }
}

/**
 * Home's track record: totals only (record, units, ROI, closing-line value), computed on the server
 * with the Records page's own functions. Individual picks never leave the server here.
 */
export async function GET() {
  try {
    const db = serviceDb();
    const [legs, prices] = await Promise.all([
      pages<PricedLeg>(
        (from) =>
          db
            .from("published_legs")
            .select(
              "leg_key,kind,name,market,matchup,game_id,published_at,result,result_source,odds,original_leg_key",
            )
            .order("published_at", { ascending: false })
            .order("leg_key")
            .range(from, from + 999) as unknown as PromiseLike<{
            data: PricedLeg[] | null;
            error: unknown;
          }>,
      ),
      pages<{ leg_key: string; first_price: number; last_price: number }>(
        (from) =>
          db
            .from("leg_market_prices")
            .select("leg_key,first_price,last_price")
            .lt("kickoff", new Date().toISOString())
            .order("leg_key")
            .range(from, from + 999) as unknown as PromiseLike<{
            data:
              | { leg_key: string; first_price: number; last_price: number }[]
              | null;
            error: unknown;
          }>,
      ),
    ]);
    const tracked = new Map<string, TrackedPrice>(
      prices.map((p) => [
        p.leg_key,
        { first: Number(p.first_price), last: Number(p.last_price) },
      ]),
    );
    return NextResponse.json(homeRecord(legs, tracked));
  } catch {
    return NextResponse.json({ unavailable: true }, { status: 503 });
  }
}
