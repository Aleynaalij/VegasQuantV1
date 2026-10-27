"use client";
import { useEffect, useState } from "react";
import { useIsAdmin } from "@/lib/use-admin";
import { supabase } from "@/lib/supabase";
import { parseSimRun, type SimRun } from "@/lib/game-sim/contract";
import { parseResearchRun } from "@/lib/game-sim/research";
import demo from "@/lib/game-sim/demo-run.json";
import SimulatorView from "./simulator-view";
const parsed = parseSimRun(demo);
type Calibration = {
  calibration_games: number;
  summary: { total: { mean_crps: number; baseline_mean_crps: number } };
};
export default function SimulatorPreview() {
  const admin = useIsAdmin();
  const [mode, setMode] = useState<"demo" | "research">("demo"),
    [research, setResearch] = useState<SimRun | null>(null),
    [calibration, setCalibration] = useState<Calibration | null>(null),
    [notice, setNotice] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    if (!admin || mode !== "research") return;
    setResearch(null);
    setNotice("Verifying engine artifact…");
    async function load() {
      try {
        const session = await supabase.auth.getSession();
        if (!session.data.session) throw new Error("Sign in required.");
        const response = await fetch("/api/simulator/research", {
          headers: {
            Authorization: `Bearer ${session.data.session.access_token}`,
          },
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Research could not load.");
        const result = parseResearchRun(data.run);
        if (!result.ok)
          throw new Error("Research run failed its contract checks.");
        if (live) {
          setResearch(result.run);
          setCalibration(data.calibration);
          setNotice("");
        }
      } catch (e) {
        if (live)
          setNotice(
            e instanceof Error ? e.message : "Research could not load.",
          );
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [admin, mode, retry]);
  if (admin === null) return <p role="status">Checking access…</p>;
  if (!admin)
    return (
      <p className="notice">
        The game simulator is an internal preview and isn’t open to members yet.
      </p>
    );
  return (
    <section>
      <nav aria-label="Simulator mode" className="sim-controls">
        <button
          type="button"
          aria-pressed={mode === "demo"}
          onClick={() => setMode("demo")}
        >
          Synthetic demo
        </button>
        <button
          type="button"
          aria-pressed={mode === "research"}
          onClick={() => setMode("research")}
        >
          Engine research · 10,000 runs
        </button>
      </nav>
      {mode === "demo" ? (
        parsed.ok ? (
          <SimulatorView key="demo" run={parsed.run} />
        ) : (
          <p role="alert">Demo failed its contract checks.</p>
        )
      ) : (
        <>
          <aside className="notice">
            <strong>
              League baseline research · not a current matchup forecast
            </strong>
            <p>
              Actual engine-generated games, using historical 2022 play
              distributions. Current team and player predictions are not ready.
            </p>
            {calibration ? (
              <p>
                Across {calibration.calibration_games} 2023 calibration games,
                total-score error was{" "}
                {calibration.summary.total.mean_crps.toFixed(3)} versus{" "}
                {calibration.summary.total.baseline_mean_crps.toFixed(3)} for
                the historical baseline (CRPS; lower is better). This model has
                not demonstrated an advantage.
              </p>
            ) : null}
            <p>
              Replay selection is disclosed. No validated edge, sportsbook price
              or player forecast is claimed.
            </p>
          </aside>
          {notice ? (
            <p role="status">
              {notice}{" "}
              <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
            </p>
          ) : null}
          {research ? (
            <SimulatorView key={research.run_id} run={research} />
          ) : null}
        </>
      )}
    </section>
  );
}
