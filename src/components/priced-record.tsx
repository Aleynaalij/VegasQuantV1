"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import { legForms } from "@/lib/leg-data";
import { closingPrices, publishedLegs, resetRecordsData } from "@/lib/records-data";
import { gatedRecords, pricedRecord, OFFICIAL_KINDS, type PricedLeg } from "@/lib/priced-record";
import type { LegForm } from "@/lib/leg-rules";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
const signed = (n: number, digits = 1) =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;

// Records card: what the graded individual picks returned at the prices they were published at.
// With `research`, the same card for the automated research board, kept apart from official picks.
export default function PricedRecord({ research = false }: { research?: boolean }) {
  const kinds = research ? ["RESEARCH"] : OFFICIAL_KINDS;
  const [record, setRecord] = useState<ReturnType<typeof pricedRecord> | null>(
    null,
  );
  const [gates, setGates] = useState<ReturnType<typeof gatedRecords> | null>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      const s = await supabase.auth.getSession();
      if (!s.data.session) return live && setRecord(null);
      // Shared with the other Records cards and cached (lib/records-data).
      const [all, tracked] = await Promise.all([publishedLegs.get(), closingPrices.get()]);
      if (!live) return;
      const legs = all.filter((l) => kinds.includes(l.kind) && l.result !== null);
      // Closing prices: the feed's last price at each pick's published book, once the game has kicked off.
      const closing = new Map(legs.filter((l) => tracked.has(l.leg_key)).map((l) => [l.leg_key, tracked.get(l.leg_key)!.last]));
      setRecord(pricedRecord(legs, closing, kinds));
      // Research legs pass every automatic rule by construction, so only official picks are split.
      if (research) return setGates(null);
      // Each pick's recent form as of its game, for the rule-by-rule split.
      const keys = [...new Set(legs.flatMap((l) => [l.leg_key, ...(l.original_leg_key ? [l.original_leg_key] : [])]))];
      const found = await legForms.loadMany(keys);
      if (!live) return;
      const forms = new Map([...found].filter((e): e is [string, LegForm] => e[1] !== undefined));
      setGates(forms.size ? gatedRecords(legs, closing, forms) : null);
    }
    void load().catch(() => live && setRecord(null));
    const stop = onUserChange(() => {
      resetRecordsData();
      setTimeout(() => void load().catch(() => undefined), 0);
    });
    return () => {
      live = false;
      stop();
    };
  }, [research]);
  if (!record || !record.picks) return null;
  const beat =
    record.hitRate !== null && record.breakEvenRate !== null
      ? record.hitRate - record.breakEvenRate
      : null;
  return (
    <section className="priced-record" aria-label={research ? "Research board record" : "Profit at published prices"}>
      <h3>{research ? "Research board record" : "Profit at published prices"}</h3>
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
        {research
          ? "Automated research legs at the FanDuel price printed when each went out; kept separate from official picks."
          : "Graded individual picks at the odds printed when each went out; a repriced or repeated pick counts once at its first price."}
        {record.unpriced > 0 &&
          ` ${record.unpriced} graded pick${record.unpriced === 1 ? " was" : "s were"} published without a price and ${record.unpriced === 1 ? "isn’t" : "aren’t"} included.`}{" "}
        Not a record of placed bets.
      </small>
    </section>
  );
}
