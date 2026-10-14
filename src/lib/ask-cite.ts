// Questions Ask Vegas can answer with a cited fact (a rule, the record, today's published pick).
// Still no advice: "should I bet…" style questions keep routing to the research.
import { normalizeHelp } from "./vegas-help";
import { findRule } from "./nba-rules";

export type CiteIntent =
  | { kind: "rule"; id: string }
  | { kind: "record" }
  | { kind: "today-pick" }
  | null;

export function citeIntent(question: string): CiteIntent {
  const q = ` ${normalizeHelp(question)} `;
  const advice =
    /\b(should i|who (will|wins)|will .* (hit|win|cover)|predict|lock of)\b/;
  if (advice.test(q)) return null;
  const rule = q.match(/\b(?:r|rule)\s?(\d{1,2})\b/);
  if (rule) {
    const id = `R-${rule[1].padStart(2, "0")}`;
    if (findRule(id)) return { kind: "rule", id };
  }
  if (
    /\b(todays|tonights|today s) (pick|play)\b|\bpick of (the )?day (today|tonight)\b|\bwhat is (the |todays )?pick of (the )?day today\b/.test(
      q,
    )
  )
    return { kind: "today-pick" };
  if (
    /\b(your|the|vegas quant s|published|track) record\b|\bwin rate\b|\broi\b|\bhow (are|have) (you|picks) (doing|done|been doing)\b/.test(
      q,
    )
  )
    return { kind: "record" };
  return null;
}

type Result = { result: string; profit_cents: number | null; stake_cents: number | null };
/** "12–7–1 · +$84.50 net · 6.2% ROI across 20 settled decisions". */
export function recordLine(results: Result[]) {
  const settled = results.filter((r) => r.result !== "PENDING");
  const wins = settled.filter((r) => r.result === "WIN").length,
    losses = settled.filter((r) => r.result === "LOSS").length,
    pushes = settled.filter((r) => r.result === "PUSH").length,
    net = settled.reduce((s, r) => s + (r.profit_cents || 0), 0),
    stake = settled
      .filter((r) => r.result !== "VOID")
      .reduce((s, r) => s + (r.stake_cents || 0), 0);
  const money = `${net < 0 ? "−" : "+"}$${(Math.abs(net) / 100).toFixed(2)}`;
  return {
    settled: settled.length,
    pending: results.length - settled.length,
    text: `${wins}–${losses}${pushes ? `–${pushes}` : ""} · ${money} net${stake ? ` · ${((net / stake) * 100).toFixed(1)}% ROI` : ""} across ${settled.length} settled ${settled.length === 1 ? "decision" : "decisions"}`,
  };
}
