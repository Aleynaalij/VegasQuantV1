"use client";
import { useIsAdmin } from "@/lib/use-admin";
import { parseSimRun } from "@/lib/game-sim/contract";
import demo from "@/lib/game-sim/demo-run.json";
import SimulatorView from "./simulator-view";

// Internal preview (#132): admin-only until the engine passes evaluation, and fed only by a
// contract-checked run. Today that is the synthetic DEMO fixture.
const parsed = parseSimRun(demo);

export default function SimulatorPreview() {
  const admin = useIsAdmin();
  if (admin === null) return <p role="status">Checking access…</p>;
  if (!admin)
    return (
      <p className="notice">
        The game simulator is an internal preview and isn’t open to members yet.
      </p>
    );
  if (!parsed.ok)
    return (
      <div role="alert">
        <p>
          This simulation run failed its contract checks and can’t be shown.
        </p>
        <ul>
          {parsed.errors.slice(0, 10).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    );
  return <SimulatorView run={parsed.run} />;
}
