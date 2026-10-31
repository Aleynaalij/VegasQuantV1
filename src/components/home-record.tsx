"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useIsAdmin } from "@/lib/use-admin";
import { HOME_RECORD_RULE, type HomeRecord } from "@/lib/track-record";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;

/**
 * Home leads with the official record once it has earned the spot (HOME_RECORD_RULE). Every number
 * sits beside the others: wins never appear without units, ROI and closing-line value.
 */
export default function HomeRecordCard() {
  const [r, setR] = useState<HomeRecord | null>(null);
  const admin = useIsAdmin();
  useEffect(() => {
    let live = true;
    fetch("/api/track-record")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (live && data && typeof data.picks === "number") setR(data);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!r || (!r.visible && !admin)) return null;
  return (
    <section className="home-record" aria-labelledby="home-record-title">
      {!r.visible ? (
        <p className="home-record-preview">
          Admin preview. Members see this once{" "}
          {HOME_RECORD_RULE.profitableAfter}+ official picks are in profit, or
          at {HOME_RECORD_RULE.alwaysAfter} picks either way ({r.picks} so far).
        </p>
      ) : null}
      <div className="home-record-head">
        <h2 id="home-record-title">The Vegas Quant record</h2>
        <small>
          {r.picks} graded official picks
          {r.since
            ? ` since ${new Date(r.since).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" })}`
            : ""}
        </small>
      </div>
      <dl className="home-record-stats">
        <div>
          <dt>Record</dt>
          <dd>
            {r.wins}–{r.losses}
            {r.pushes ? `–${r.pushes}` : ""}
          </dd>
        </div>
        <div>
          <dt>Hit rate</dt>
          <dd>{pct(r.hitRate)}</dd>
          <small>needed {pct(r.breakEvenRate)} at these prices</small>
        </div>
        <div className={r.units >= 0 ? "is-up" : "is-down"}>
          <dt>Units</dt>
          <dd>{signed(r.units)}u</dd>
          <small>ROI {r.roi === null ? "—" : `${signed(r.roi)}%`}</small>
        </div>
        <div>
          <dt>Beat the close</dt>
          <dd>{pct(r.beatCloseRate)}</dd>
          <small>{r.clvLegs} priced picks tracked</small>
        </div>
      </dl>
      <p className="home-record-note">
        Every published pick counts, at the price it was published. 1 unit per
        pick. Past results don’t guarantee future ones.{" "}
        <Link href="/history">Full record →</Link>
      </p>
    </section>
  );
}
