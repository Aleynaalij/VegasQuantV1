"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { onUserChange } from "@/lib/auth-user";
import type { NewSport } from "@/lib/sport-contract";
import { SPORTS } from "@/lib/sports";
import { Shell } from "../ui";

type Counts = {
  selections: number;
  win: number;
  loss: number;
  push: number;
  void: number;
  pending: number;
};

/** Each sport's published selections, derived from its confirmed-result grader. */
export default function SportRecords({ sport }: { sport: NewSport | "nba" }) {
  const [counts, setCounts] = useState<Counts | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    let live = true,
      generation = 0;
    async function load() {
      const version = ++generation;
      const r = await (sport === "nba"
        ? supabase.rpc("nba_editorial_records")
        : supabase.rpc("sports_records", { p_sport: sport }));
      if (!live || version !== generation) return;
      setError(!!r.error);
      if (!r.error && r.data) setCounts(r.data as Counts);
    }
    void load();
    const timer = setInterval(() => void load(), 60000);
    const stop = onUserChange(() => {
      setCounts(null);
      void load();
    });
    return () => {
      live = false;
      clearInterval(timer);
      stop();
    };
  }, [sport]);
  const info = SPORTS[sport];
  return (
    <Shell active="history" sport={sport}>
      <div className="sport-game">
        <section className="sport-game-head">
          <span className="nba-eyebrow">VEGAS QUANT · {info.label}</span>
          <h1>{info.name} record</h1>
          <p className="sport-empty">
            Published {info.name} selections only, graded from confirmed finals.
            Each sport keeps its own record.
          </p>
        </section>
        {error ? (
          <p role="alert" className="vq-slate-empty">
            The record could not load.
          </p>
        ) : !counts ? (
          <p role="status" className="vq-slate-empty">
            Loading…
          </p>
        ) : counts.selections === 0 ? (
          <p className="vq-slate-empty">
            No {info.name} selections have been published yet.
          </p>
        ) : (
          <dl className="sport-record">
            {(["win", "loss", "push", "void", "pending"] as const).map((k) => (
              <div key={k}>
                <dt>
                  {k === "win"
                    ? "Won"
                    : k === "loss"
                      ? "Lost"
                      : k[0].toUpperCase() + k.slice(1)}
                </dt>
                <dd>{counts[k]}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </Shell>
  );
}
