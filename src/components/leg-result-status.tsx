"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
export type ResultState = {
  result?: string;
  status?: string;
  value?: number;
  reason?: string;
};
export function useReleaseResults(releaseId?: string, count = 0) {
  const [states, setStates] = useState<Record<string, ResultState>>({});
  useEffect(() => {
    let live = true,
      epoch = 0;
    setStates({});
    if (!releaseId || !count) return;
    const keys = Array.from(
      { length: count },
      (_, i) => `candidate:${releaseId}:${i + 1}`,
    );
    async function load() {
      const n = ++epoch;
      const session = await supabase.auth.getSession();
      if (!live || n !== epoch) return;
      if (!session.data.session) {
        setStates({});
        return;
      }
      const [r, p] = await Promise.all([
        supabase
          .from("research_leg_results")
          .select("leg_key,result")
          .in("leg_key", keys),
        supabase
          .from("leg_result_progress")
          .select("leg_key,status,value,reason")
          .in("leg_key", keys),
      ]);
      if (!live || n !== epoch) return;
      const next: Record<string, ResultState> = {};
      for (const x of p.data || []) next[x.leg_key] = x;
      for (const x of r.data || [])
        next[x.leg_key] = { ...next[x.leg_key], result: x.result };
      setStates(next);
    }
    void load();
    const timer = setInterval(load, 30000);
    const auth = supabase.auth.onAuthStateChange(() => {
      ++epoch;
      setStates({});
      setTimeout(() => {
        if (live) void load();
      }, 0);
    });
    return () => {
      live = false;
      ++epoch;
      clearInterval(timer);
      auth.data.subscription.unsubscribe();
    };
  }, [releaseId, count]);
  return states;
}
export default function LegResultStatus({ state }: { state?: ResultState }) {
  if (!state?.result && !state?.status) return null;
  return (
    <p role="status">
      <strong>
        {state.status === "CONFLICT"
          ? "Result discrepancy · review required"
          : state.result
            ? `${state.result === "WIN" ? "✓" : ""} ${state.result} · Final published result`
            : state.status === "TARGET_REACHED_LIVE"
              ? "Target reached live · not final"
              : state.status === "AWAITING_CORROBORATION"
                ? "Final stats awaiting corroboration"
                : state.status === "CONFLICT"
                  ? "Result discrepancy · review required"
                  : "Automatic tracking"}
      </strong>
      {state.value != null && ` · ${state.value} recorded`}
      {state.status === "CONFLICT" && (
        <span> · Prior result retained pending review.</span>
      )}
    </p>
  );
}
