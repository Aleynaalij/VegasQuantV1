"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

// Admin grading for selections the automatic result sync cannot settle (quarter props,
// spreads, recaps, watch notes). Results are immutable once recorded, so this asks first.
export default function ManualResult({
  legKey,
  label,
  onRecorded,
}: {
  legKey: string;
  label: string;
  onRecorded: () => void;
}) {
  const [result, setResult] = useState(""),
    [source, setSource] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const valid = !!result && /^https:\/\/\S+$/.test(source.trim());
  async function record() {
    if (
      !valid ||
      !window.confirm(
        `Record ${result} for ${label}? Results are permanent and update members' records.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    const r = await supabase
      .from("research_leg_results")
      .insert({ leg_key: legKey, result, source_url: source.trim() });
    setBusy(false);
    if (r.error)
      setError(
        r.error.code === "23505"
          ? "Already graded. Refreshing."
          : "Result could not be recorded. Check admin access and retry.",
      );
    if (!r.error || r.error.code === "23505") onRecorded();
  }
  return (
    <div className="manual-result">
      <label>
        Result
        <select value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="">Choose</option>
          <option value="WIN">WIN</option>
          <option value="LOSS">LOSS</option>
          <option value="PUSH">PUSH</option>
          <option value="VOID">VOID · not a pick or no action</option>
        </select>
      </label>
      <label>
        Source (https box score or play-by-play)
        <input
          type="url"
          inputMode="url"
          placeholder="https://www.espn.com/nfl/boxscore/_/gameId/…"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </label>
      <button type="button" disabled={!valid || busy} onClick={record}>
        {busy ? "Recording…" : "Record result"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
