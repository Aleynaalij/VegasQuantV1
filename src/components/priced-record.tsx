"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { gatedRecords, pricedRecord, type PricedLeg } from "@/lib/priced-record";
import type { LegForm } from "@/lib/leg-rules";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

// Records card: what the graded individual picks returned at the prices they were published at.
export default function PricedRecord() {
  const [record, setRecord] = useState<ReturnType<typeof pricedRecord> | null>(
    null,
  );
  const [gates, setGates] = useState<ReturnType<typeof gatedRecords> | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return live && setRecord(null);
      const r = await supabase
        .from("published_legs")
        .select(
          "leg_key,kind,name,market,matchup,game_id,published_at,result,result_source,odds,original_leg_key",
        )
        .in("kind", ["SINGLE", "PICK_OF_DAY"])
        .not("result", "is", null)
        .limit(2000);
      if (!live) return;
      if (r.error) return setRecord(null);
      const legs = (r.data || []) as PricedLeg[];
      // Closing prices: the feed's last price at each pick's published book, once the game has kicked off.
      const close = await supabase
        .from("leg_market_prices")
        .select("leg_key,last_price,kickoff")
        .in("leg_key", legs.map((l) => l.leg_key))
        .lt("kickoff", new Date().toISOString());
      // Each pick's recent form as of its game, for the rule-by-rule split.
      const keys = [...new Set(legs.flatMap((l) => [l.leg_key, ...(l.original_leg_key ? [l.original_leg_key] : [])]))];
      const forms = new Map<string, LegForm>();
      for (let i = 0; i < keys.length; i += 150) {
        const h = await supabase
          .from("leg_history")
          .select("leg_key,cleared,sample,median,position")
          .in("leg_key", keys.slice(i, i + 150));
        for (const x of (h.error ? [] : h.data || []).filter((x) => x.sample > 0))
          forms.set(x.leg_key, { cleared: x.cleared, sample: x.sample, median: x.median === null ? null : Number(x.median), position: x.position });
      }
      if (!live) return;
      const closing = new Map(
        (close.error ? [] : close.data || []).map((x) => [x.leg_key, Number(x.last_price)]),
      );
      setRecord(pricedRecord(legs, closing));
      setGates(forms.size ? gatedRecords(legs, closing, forms) : null);
    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() =>
      setTimeout(() => void load(), 0),
    );
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
    };
  }, []);
  if (!record || !record.picks) return null;
  const beat =
    record.hitRate !== null && record.breakEvenRate !== null
      ? record.hitRate - record.breakEvenRate
      : null;
  return (
    <section className="priced-record" aria-label="Profit at published prices">
      <h3>Profit at published prices</h3>
      <div className="priced-record-stats">
        <div>
          <b className={record.units >= 0 ? "up" : "down"}>
            {signed(record.units)}u
          </b>
          <small>1 unit per pick</small>
        </div>
        <div>
          <b>{record.roi === null ? "—" : `${signed(record.roi, 0)}%`}</b>
          <small>ROI</small>
        </div>
        <div>
          <b>
            {record.wins}–{record.losses}
            {record.pushes ? `–${record.pushes}` : ""}
          </b>
          <small>Priced picks</small>
        </div>
      </div>
      <p>
        Hit {pct(record.hitRate)} where these prices needed{" "}
        {pct(record.breakEvenRate)} to break even
        {beat !== null &&
          ` (${beat >= 0 ? "+" : "−"}${Math.abs(Math.round(beat))} pts)`}
        .
      </p>
      {gates && (gates.pass.picks > 0 || gates.fail.picks > 0) && (
        <div className="priced-record-gates" aria-label="Record by selection rules">
          {(
            [
              ["Passed every rule", gates.pass],
              ["Broke a rule", gates.fail],
              ["Not enough history", gates.unknown],
            ] as const
          )
            .filter(([, r]) => r.picks > 0)
            .map(([label, r]) => (
              <p key={label}>
                <span>
                  {label} <small>· {r.wins}–{r.losses}{r.pushes ? `–${r.pushes}` : ""}</small>
                </span>
                <b className={r.units >= 0 ? "up" : "down"}>{signed(r.units)}u</b>
              </p>
            ))}
          <small>
            Rules from our published lessons: recent form must beat the price, no near-even-money
            props, sensible Pick of the Day prices, halftime discipline, and no drifting prices.
          </small>
        </div>
      )}
      <small>
        Graded individual picks at the odds printed when each went out; a
        repriced or repeated pick counts once at its first price.
        {record.unpriced > 0 &&
          ` ${record.unpriced} graded pick${record.unpriced === 1 ? " was" : "s were"} published without a price and ${record.unpriced === 1 ? "isn’t" : "aren’t"} included.`}{" "}
        Not a record of placed bets.
      </small>
    </section>
  );
}
