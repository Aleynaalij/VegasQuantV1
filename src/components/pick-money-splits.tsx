"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { time } from "@/lib/domain";
type Split = {
  book: string;
  selection: string;
  ticket_pct: number | null;
  handle_pct: number | null;
  sample_size: number | null;
  sample_window: string;
  observed_at: string;
  time_basis: string;
  source: string;
};
export default function PickMoneySplits({ pickId }: { pickId: string }) {
  const [rows, setRows] = useState<Split[]>([]),
    [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    async function load() {
      const r = await supabase.rpc("published_pick_splits", {
        p_pick_id: pickId,
      });
      if (alive) {
        setRows(r.data || []);
        setState(r.error ? "error" : "ready");
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60000);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [pickId]);
  return (
    <section
      className="pick-splits"
      aria-label="Public money and ticket splits"
    >
      <strong>PUBLIC MONEY · THIS PICK</strong>
      {state === "loading" ? (
        <p>Checking sourced splits…</p>
      ) : state === "error" ? (
        <p>Splits could not be loaded. Try refreshing.</p>
      ) : !rows.length ? (
        <p>
          Verified ticket and money splits are not available for this exact pick
          and line. Game-level figures are not a substitute.
        </p>
      ) : (
        rows.map((r) => (
          <div className="split-observation" key={r.book}>
            <b>
              {r.book} · {r.selection}
            </b>
            {(
              [
                ["Tickets", r.ticket_pct],
                ["Money", r.handle_pct],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <span>
                  {label} <b>{value === null ? "Unknown" : `${value}%`}</b>
                </span>
                {value !== null && (
                  <meter
                    min={0}
                    max={100}
                    value={value}
                    aria-label={`${label} on ${r.selection}`}
                  />
                )}
              </div>
            ))}
            <small>
              {r.sample_window} · Sample: {r.sample_size ?? "not supplied"}
              <br />
              {r.time_basis}: {time(r.observed_at)} ·{" "}
              <a href={r.source} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            </small>
          </div>
        ))
      )}
      <small>
        Tickets = number of bets. Money = dollars wagered. Provider-specific
        snapshots, not the entire market or proof of sharp action.
      </small>
    </section>
  );
}
