"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { bestPrices, breakEven, checkLeg, formLine, stamped, statUnit, verdict, type BookPrice, type LegForm } from "@/lib/leg-rules";

type Price = { first: number; last: number };
/** Latest prospective shadow-model forecast for a leg (administrators only). */
type Estimate = { probability: number; push: number; direction: string; line: number; odds: number | null; blockers: number; at: string };
export type FormData = {
  forms: Record<string, LegForm>;
  prices: Record<string, Price>;
  estimates: Record<string, Estimate>;
  /** Latest exact-line price at every collected book, best first. */
  books: Record<string, BookPrice[]>;
  admin: boolean;
};

/** Recent form, tracked prices and (for administrators) rule checks for a set of leg keys. */
export function useLegForms(keys: string[]): FormData {
  const [data, setData] = useState<FormData>({ forms: {}, prices: {}, estimates: {}, books: {}, admin: false });
  const id = keys.join(",");
  useEffect(() => {
    let live = true;
    const list = id ? id.split(",") : [];
    if (!list.length) return;
    // History arrives after publication and prices move until kickoff, so keep refreshing.
    async function load() {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return;
      const [h, p, a, b] = await Promise.all([
        supabase.from("leg_history").select("leg_key,cleared,sample,median,position").in("leg_key", list),
        supabase.from("leg_market_prices").select("leg_key,first_price,last_price").in("leg_key", list),
        supabase.rpc("is_admin"),
        supabase.from("leg_book_prices").select("leg_key,book,price").in("leg_key", list),
      ]);
      if (!live) return;
      const m = a.data === true ? await supabase.rpc("admin_leg_model_estimates", { p_keys: list }) : null;
      if (!live) return;
      setData({
        forms: Object.fromEntries(
          (h.data || []).filter((x) => x.sample > 0).map((x) => [x.leg_key, { cleared: x.cleared, sample: x.sample, median: x.median === null ? null : Number(x.median), position: x.position }]),
        ),
        prices: Object.fromEntries(
          (p.data || []).map((x) => [x.leg_key, { first: Number(x.first_price), last: Number(x.last_price) }]),
        ),
        estimates: Object.fromEntries(
          (m?.error ? [] : (m?.data as any[]) || []).map((x) => [
            x.leg_key,
            {
              probability: Number(x.research_probability),
              push: Number(x.push_probability),
              direction: x.direction,
              line: Number(x.line),
              odds: x.odds === null ? null : Number(x.odds),
              blockers: x.blockers,
              at: x.recorded_at,
            },
          ]),
        ),
        books: Object.fromEntries(
          Object.entries(
            (b.error ? [] : b.data || []).reduce<Record<string, BookPrice[]>>((acc, x) => {
              (acc[x.leg_key] ||= []).push({ book: x.book, price: Number(x.price) });
              return acc;
            }, {}),
          ).map(([k, v]) => [k, bestPrices(v)]),
        ),
        admin: a.data === true,
      });
    }
    void load();
    const timer = setInterval(load, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [id]);
  return data;
}

/** "Cleared 4 of last 5 · median 62 yds" against the price's break-even; rule checks for admins. */
export default function LegFormLine({
  legKey,
  data,
  price,
  market,
  matchup,
  pickOfDay,
}: {
  legKey: string;
  data: FormData;
  price: number | null;
  market: string;
  matchup?: string;
  pickOfDay?: boolean;
}) {
  const form = data.forms[legKey],
    tracked = data.prices[legKey],
    books = data.books[legKey] || [];
  // Rules judge the price printed at publication; a quote tracked later never stands in for it.
  const published = price;
  if (!form && !books.length && !data.admin) return null;
  const be = published !== null && Math.abs(published) >= 100 ? breakEven(published) : null;
  const rate = form ? (form.cleared / form.sample) * 100 : null;
  const tone = rate === null || be === null || form!.sample < 5 ? "" : rate >= be + 5 ? "good" : "bad";
  const checks = data.admin ? checkLeg({ price: published, lastPrice: tracked?.last, form, market, matchup, pickOfDay }) : [];
  const approved = stamped({ price: published, lastPrice: tracked?.last, form, market, matchup, pickOfDay });
  return (
    <div className={`leg-form ${tone}`}>
      {approved && <VqStamp />}
      {form && (
        <p>
          <strong>{formLine(form, statUnit(market))}</strong>
          {be !== null && <span>Price needs {Math.round(be)}%</span>}
        </p>
      )}
      {books.length > 0 && (
        <p className="leg-books">
          <span>Best price</span>
          {books.slice(0, 3).map((x, i) => (
            <b key={x.book} className={i === 0 ? "best" : ""}>
              {x.book} {x.price > 0 ? "+" : ""}
              {x.price}
            </b>
          ))}
        </p>
      )}
      {data.admin && data.estimates[legKey] && (() => {
        const e = data.estimates[legKey];
        const win = (e.probability / (1 - e.push)) * 100;
        return (
          <p className="leg-model">
            <b>Model (shadow) {Math.round(win)}%</b> · {e.direction === "under" ? "u" : "o"}
            {e.line}
            {e.odds !== null && ` ${e.odds > 0 ? "+" : ""}${e.odds}`}
            {e.odds !== null && Math.abs(e.odds) >= 100 && ` · needs ${Math.round(breakEven(e.odds))}%`} · {e.blockers} blocker
            {e.blockers === 1 ? "" : "s"} · research only
          </p>
        );
      })()}
      {data.admin && (
        <details className="leg-rules">
          <summary>
            Rules · <b className={`rule-${verdict(checks)}`}>{verdict(checks) === "pass" ? "all pass" : verdict(checks) === "fail" ? `${checks.filter((c) => c.status === "fail").length} failed` : "incomplete"}</b>
          </summary>
          <ul>
            {checks.map((c) => (
              <li key={c.id} className={`rule-${c.status}`}>
                <b>{c.id}</b> {c.label}: {c.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** The small stamp of approval on a recommended leg (see `stamped` in lib/leg-rules). */
export function VqStamp({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={`vq-stamp${compact ? " compact" : ""}`}
      title="Vegas Quant approved: passes every rule and recent form beats the price by 15+ points"
      aria-label="Vegas Quant approved"
    >
      <span aria-hidden="true">✓</span>
      {!compact && <>VQ APPROVED</>}
    </span>
  );
}
