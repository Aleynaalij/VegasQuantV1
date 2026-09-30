"use client";

import { useState } from "react";
import { money, odd } from "@/lib/domain";

export default function CopyPick({ selection, odds, stakeCents }: {
  selection: string;
  odds: number;
  stakeCents: number;
}) {
  const [status, setStatus] = useState("");
  const [manual, setManual] = useState(false);
  const text = `${selection}\nOdds: ${odd(odds)}\nStake: ${money(stakeCents)}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setManual(false);
      setStatus("Pick copied.");
    } catch {
      setManual(true);
      setStatus("Select and copy the published pick below.");
    }
  }

  return <div className="copy-pick">
    <button type="button" onClick={() => void copy()}>Copy Pick</button>
    <span role="status" aria-live="polite">{status}</span>
    {manual && <textarea aria-label="Published pick to copy" readOnly value={text}
      rows={3} onFocus={(event) => event.currentTarget.select()} />}
  </div>;
}
