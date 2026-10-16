"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { breakEven, checkLeg, formLine, statUnit, verdict, type LegForm } from "@/lib/leg-rules";

type Price = { first: number; last: number };
export type FormData = { forms: Record<string, LegForm>; prices: Record<string, Price>; admin: boolean };

/** Recent form, tracked prices and (for administrators) rule checks for a set of leg keys. */
export function useLegForms(keys: string[]): FormData {
  const [data, setData] = useState<FormData>({ forms: {}, prices: {}, admin: false });
  const id = keys.join(",");
  useEffect(() => {
    let live = true;
    const list = id ? id.split(",") : [];
    if (!list.length) return;
    (async () => {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return;
      const [h, p, a] = await Promise.all([
        supabase.from("leg_history").select("leg_key,cleared,sample,median,position").in("leg_key", list),
        supabase.from("leg_market_prices").select("leg_key,first_price,last_price").in("leg_key", list),
        supabase.rpc("is_admin"),
      ]);
      if (!live) return;
      setData({
        forms: Object.fromEntries(
          (h.data || []).filter((x) => x.sample > 0).map((x) => [x.leg_key, { cleared: x.cleared, sample: x.sample, median: x.median === null ? null : Number(x.median), position: x.position }]),
        ),
        prices: Object.fromEntries(
          (p.data || []).map((x) => [x.leg_key, { first: Number(x.first_price), last: Number(x.last_price) }]),
        ),
        admin: a.data === true,
      });
    })();
    return () => {
      live = false;
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
    tracked = data.prices[legKey];
  const published = price ?? tracked?.first ?? null;
  if (!form && !data.admin) return null;
  const be = published !== null && Math.abs(published) >= 100 ? breakEven(published) : null;
  const rate = form ? (form.cleared / form.sample) * 100 : null;
  const tone = rate === null || be === null || form!.sample < 5 ? "" : rate >= be + 5 ? "good" : "bad";
  const checks = data.admin ? checkLeg({ price: published, lastPrice: tracked?.last, form, market, matchup, pickOfDay }) : [];
  return (
    <div className={`leg-form ${tone}`}>
      {form && (
        <p>
          <strong>{formLine(form, statUnit(market))}</strong>
          {be !== null && <span>Price needs {Math.round(be)}%</span>}
        </p>
      )}
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
