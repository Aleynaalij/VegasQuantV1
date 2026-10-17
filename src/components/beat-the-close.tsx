"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { closingPrices, publishedLegs } from "@/lib/records-data";
import { closingLineRecord } from "@/lib/priced-record";

// Records card: how often our published legs got a better price than the market closed at.
export default function BeatTheClose() {
  const [record, setRecord] = useState<ReturnType<typeof closingLineRecord> | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return live && setRecord(null);
      // Every page of closing prices and published legs, shared with the other Records cards.
      const [tracked, all] = await Promise.all([closingPrices.get(), publishedLegs.get()]);
      if (!live) return;
      if (!tracked.size) return setRecord(null);
      setRecord(closingLineRecord(all.filter((l) => tracked.has(l.leg_key)), tracked));
    }
    void load().catch(() => live && setRecord(null));
    const stop = onUserChange(() => setTimeout(() => void load().catch(() => undefined), 0));
    return () => {
      live = false;
      stop();
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
