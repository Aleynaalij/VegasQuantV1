"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { legResults, useLegDataVersion, wireAuthInvalidation, type ResultState } from "@/lib/leg-data";
export type { ResultState } from "@/lib/leg-data";
/** Results and live progress for a release's legs, batched with every other card on screen. */
export function useReleaseResults(releaseId?: string, count = 0) {
  const [states, setStates] = useState<Record<string, ResultState>>({});
  const version = useLegDataVersion();
  useEffect(() => {
    wireAuthInvalidation();
    let live = true;
    if (!releaseId || !count) {
      setStates({});
      return;
    }
    const keys = Array.from({ length: count }, (_, i) => `candidate:${releaseId}:${i + 1}`);
    (async () => {
      const session = await supabase.auth.getSession();
      if (!live) return;
      if (!session.data.session) return setStates({});
      const found = await legResults.loadMany(keys);
      if (!live) return;
      setStates(Object.fromEntries([...found].filter(([, v]) => v !== undefined)) as Record<string, ResultState>);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, [releaseId, count, version]);
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
