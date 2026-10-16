"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { closingLineRecord, type PricedLeg, type TrackedPrice } from "@/lib/priced-record";

// Records card: how often our published legs got a better price than the market closed at.
export default function BeatTheClose() {
  const [record, setRecord] = useState<ReturnType<typeof closingLineRecord> | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return live && setRecord(null);
      // Closing prices exist once a tracked leg's game has kicked off.
      // Read every page in a stable order so the lifetime record never silently drops rows.
      const cutoff = new Date().toISOString();
      const tracked = new Map<string, TrackedPrice>();
      for (let from = 0; ; from += 1000) {
        const page = await supabase
          .from("leg_market_prices")
          .select("leg_key,first_price,last_price")
          .lt("kickoff", cutoff)
          .order("leg_key")
          .range(from, from + 999);
        if (!live) return;
        if (page.error) return setRecord(null);
        for (const p of page.data || [])
          tracked.set(p.leg_key, { first: Number(p.first_price), last: Number(p.last_price) });
        if ((page.data || []).length < 1000) break;
      }
      if (!tracked.size) return setRecord(null);
      const keys = [...tracked.keys()];
      const legs: PricedLeg[] = [];
      for (let i = 0; i < keys.length; i += 150) {
        const r = await supabase
          .from("published_legs")
          .select("leg_key,kind,name,market,matchup,game_id,published_at,result,result_source,odds,original_leg_key")
          .in("leg_key", keys.slice(i, i + 150));
        if (r.error) return live && setRecord(null);
        legs.push(...((r.data || []) as PricedLeg[]));
      }
      if (live) setRecord(closingLineRecord(legs, tracked));
    }
    void load();
    const auth = supabase.auth.onAuthStateChange(() => setTimeout(() => void load(), 0));
    return () => {
      live = false;
      auth.data.subscription.unsubscribe();
    };
  }, []);
  if (!record || !record.legs) return null;
  const avg = record.avgPoints;
  return (
    <section className="priced-record" aria-label="Beat the close">
      <h3>Beat the close</h3>
      <div className="priced-record-stats">
        <div>
          <b className={record.beatRate === null ? "" : record.beatRate >= 50 ? "up" : "down"}>
            {record.beatRate === null ? "—" : `${Math.round(record.beatRate)}%`}
          </b>
          <small>Beat the close</small>
        </div>
        <div>
          <b className={avg === null || Math.abs(avg) < 0.05 ? "" : avg > 0 ? "up" : "down"}>
            {avg === null ? "—" : `${avg >= 0 ? "+" : "−"}${Math.abs(avg).toFixed(1)}`}
          </b>
          <small>Avg pts of value</small>
        </div>
        <div>
          <b>
            {record.beat}–{record.tied}–{record.missed}
          </b>
          <small>Beat · same · worse</small>
        </div>
      </div>
      <p>
        Across {record.legs} published leg{record.legs === 1 ? "" : "s"}, our price was better than
        the close on {record.beat} and worse on {record.missed}
        {record.tied ? `; ${record.tied} closed at the same price` : ""}.
      </p>
      <small>
        The closing price is the last price at each leg’s book before kickoff. Getting a better price
        than the close is the clearest early sign of a real edge, win or lose, and needs hundreds of
        legs to mean much. Our price is the one printed with the pick, or the first price we tracked
        when it went out without one. Beat-the-close share counts only legs whose price moved.
      </small>
    </section>
  );
}
