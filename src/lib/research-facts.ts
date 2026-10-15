/** Turns stored analyst research into reader-facing facts, leaving out internal model plumbing. */
export type ResearchFact = { label: string; value: string; kind: "text" | "time" | "link" | "note" };

/** Internal bookkeeping the analyst pipeline stores but members never need to see. */
const HIDDEN = new Set([
  "id", "model_id", "input_sources", "sha256", "file", "as_of", "generated_at", "coverage",
  "priced_cases", "scanner_cases", "official_eligible", "blockers", "provider_quote_timestamp",
  "editorial", "cards", "priced", "unavailable",
]);
const LABELS: Record<string, string> = {
  spread: "Spread", total: "Total", moneyline: "Moneyline", sportsbook: "Sportsbook",
  public_read: "Public money", observed_at: "Line seen", retrieved_at: "Line seen",
  target_quote: "Target price", assessment: "Our read", probability: "Win probability",
  forecast: "Forecast", location: "Location", issued_at: "Forecast issued", status: "Status",
  sharp_consensus: "Sharp money", retail_consensus: "Book consensus", fear_index: "Fear index",
  note: "Keep in mind", source: "Source",
};
/** Fine print rather than a headline fact. */
const NOTES = new Set(["quote_notice", "limitations"]);

const label = (key: string) =>
  LABELS[key] || key.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

/** Placeholders and machine values that read as noise to a member. */
function noise(value: string) {
  return (
    /^unknown\b/i.test(value) ||
    /collector not configured/i.test(value) ||
    /^[0-9a-f]{24,}$/i.test(value) ||
    /^[A-Z]+(?:_[A-Z]+)+$/.test(value)
  );
}

function scalar(key: string, value: unknown): ResearchFact | null {
  if (value == null || typeof value === "boolean") return null;
  if (typeof value === "object") {
    if (key === "target_quote" && !Array.isArray(value)) {
      const q = value as { line?: unknown; odds?: unknown };
      if (q.line == null) return null;
      const odds = typeof q.odds === "number" ? ` (${q.odds > 0 ? "+" : ""}${q.odds})` : "";
      return { label: label(key), value: `${q.line}${odds}`, kind: "text" };
    }
    if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) {
      const list = value.map(String).filter((v) => v && !noise(v));
      return list.length ? { label: label(key), value: list.join(" · "), kind: "text" } : null;
    }
    return null;
  }
  const text = String(value).trim();
  if (!text || noise(text)) return null;
  if (/^https?:\/\//.test(text)) return { label: label(key), value: text, kind: "link" };
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) return { label: label(key), value: text, kind: "time" };
  return { label: label(key), value: text, kind: NOTES.has(key) ? "note" : "text" };
}

/** Facts for one research topic; arrays give one group per item. */
export function researchFacts(value: unknown): ResearchFact[][] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => researchFacts(v)).filter((g) => g.length);
  if (typeof value !== "object") {
    const fact = scalar("", value);
    return fact ? [[{ ...fact, label: "" }]] : [];
  }
  const facts = Object.entries(value as Record<string, unknown>)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, v]) => scalar(k, v))
    .filter((f): f is ResearchFact => !!f)
    // Headline facts first, fine print last.
    .sort((a, b) => Number(a.kind === "note") - Number(b.kind === "note"));
  return facts.some((f) => f.kind !== "note" && f.kind !== "link") ? [facts] : [];
}
