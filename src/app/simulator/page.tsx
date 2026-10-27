import "./simulator.css";
import type { Metadata } from "next";
import { Shell } from "@/components/ui";
import SimulatorPreview from "@/components/game-sim/simulator-preview";

export const metadata: Metadata = {
  title: "Game simulator · internal preview",
  robots: { index: false, follow: false },
};

export default function SimulatorPage() {
  return (
    <Shell active="simulator">
      <div className="heading">
        <div>
          <span className="eyebrow">INTERNAL PREVIEW</span>
          <h1>Game simulator</h1>
          <p>Watch a game play out on the field, play by play.</p>
        </div>
      </div>
      <SimulatorPreview />
    </Shell>
  );
}
