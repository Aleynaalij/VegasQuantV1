// Shared, batched, cached per-leg data for every leg card on screen. See lib/batch.ts.
// One app-wide refresh clock replaces the per-card polling timers: every minute (while the tab is
// visible) the cached leg data expires and every mounted card reloads in the same tick, so each
// table is queried once for all cards instead of once per card.
import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { batchLoader, memo } from "./batch";
import { bestPrices, type BookPrice, type LegForm } from "./leg-rules";

const keyed = <T,>(rows: { leg_key: string }[] | null, value: (r: any) => T) =>
  new Map<string, T>((rows || []).map((r) => [r.leg_key, value(r)]));

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: unknown }>) {
  const r = await q;
  if (r.error) throw r.error;
  return r.data || [];
}

export const legForms = batchLoader<LegForm>(async (keys) =>
  keyed(
    (await rows(supabase.from("leg_history").select("leg_key,cleared,sample,median,position").in("leg_key", keys))).filter(
      (x: any) => x.sample > 0,
    ) as any,
    (x) => ({ cleared: x.cleared, sample: x.sample, median: x.median === null ? null : Number(x.median), position: x.position }),
  ),
);
export const legPrices = batchLoader<{ first: number; last: number }>(async (keys) =>
  keyed(await rows(supabase.from("leg_market_prices").select("leg_key,first_price,last_price").in("leg_key", keys)) as any, (x) => ({
    first: Number(x.first_price),
    last: Number(x.last_price),
  })),
);
export const legBooks = batchLoader<BookPrice[]>(async (keys) => {
  const all = (await rows(supabase.from("leg_book_prices").select("leg_key,book,price").in("leg_key", keys))) as any[];
  const by = new Map<string, BookPrice[]>();
  for (const x of all) by.set(x.leg_key, [...(by.get(x.leg_key) || []), { book: x.book, price: Number(x.price) }]);
  return new Map([...by].map(([k, v]) => [k, bestPrices(v)]));
});
export type ResultState = { result?: string; status?: string; value?: number; reason?: string };
export const legResults = batchLoader<ResultState>(async (keys) => {
  const [r, p] = await Promise.all([
    rows(supabase.from("research_leg_results").select("leg_key,result").in("leg_key", keys)),
    rows(supabase.from("leg_result_progress").select("leg_key,status,value,reason").in("leg_key", keys)),
  ]);
  const next = new Map<string, ResultState>();
  for (const x of p as any[]) next.set(x.leg_key, x);
  for (const x of r as any[]) next.set(x.leg_key, { ...next.get(x.leg_key), result: x.result });
  return next;
});

/** Keys are `${userId}|${legKey}`: a different user never sees another user's cached state. */
const mine = (table: "saved_legs" | "leg_tails") =>
  batchLoader<boolean>(async (keys) => {
    const out = new Map<string, boolean>();
    const byUser = new Map<string, string[]>();
    for (const k of keys) {
      const [uid, leg] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
      byUser.set(uid, [...(byUser.get(uid) || []), leg]);
    }
    for (const [uid, legs] of byUser) {
      const found = new Set(((await rows(supabase.from(table).select("leg_key").eq("user_id", uid).in("leg_key", legs))) as any[]).map((x) => x.leg_key));
      for (const leg of legs) out.set(`${uid}|${leg}`, found.has(leg));
    }
    return out;
  });
export const savedLegs = mine("saved_legs");
export const tailedLegs = mine("leg_tails");
/** Tail counts have no batch query: a few calls at a time, only for cards on screen, cached. */
export const tailCounts = batchLoader<number>(
  async (keys) => {
    const out = new Map<string, number>();
    for (let i = 0; i < keys.length; i += 6) {
      const part = keys.slice(i, i + 6);
      const res = await Promise.all(part.map((k) => supabase.rpc("leg_tail_count", { p_leg: k })));
      res.forEach((r, j) => {
        if (!r.error) out.set(part[j], Number(r.data || 0));
      });
    }
    return out;
  },
  { ttl: 120000 },
);
export const isAdmin = memo(async () => {
  const r = await supabase.rpc("is_admin");
  return r.data === true;
}, 300000);

// The app-wide refresh clock.
let version = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const LEG_LOADERS = [legForms, legPrices, legBooks, legResults];
export function refreshLegData() {
  for (const l of LEG_LOADERS) l.invalidate();
  version++;
  for (const f of listeners) f();
}
function tick() {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  refreshLegData();
}
/** Re-renders the caller on each app-wide refresh; returns the refresh version. */
export function useLegDataVersion() {
  const [v, setV] = useState(version);
  useEffect(() => {
    const f = () => setV(version);
    listeners.add(f);
    if (!timer) timer = setInterval(tick, 60000);
    return () => {
      listeners.delete(f);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return v;
}

// Sign-in changes invalidate everything user-specific.
let authWired = false;
export function wireAuthInvalidation() {
  if (authWired || typeof window === "undefined") return;
  authWired = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      savedLegs.invalidate();
      tailedLegs.invalidate();
      isAdmin.reset();
      refreshLegData();
    }
  });
}
