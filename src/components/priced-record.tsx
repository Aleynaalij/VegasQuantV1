"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { pricedRecord, type PricedLeg } from "@/lib/priced-record";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

// Records card: what the graded individual picks returned at the prices they were published at.
export default function PricedRecord() {
  const [record, setRecord] = useState<ReturnType<typeof pricedRecord> | null>(
    null,
  );
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
      if (live) setRecord(r.error ? null : pricedRecord((r.data || []) as PricedLeg[]));
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
