import {
  hubHref,
  eventHref,
  type ResearchEvent,
  type Finding,
} from "../research-hub";
import type { HubData } from "../research-hub-reader";
export type PostState =
  | "loading"
  | "signed-out"
  | "unavailable"
  | "empty"
  | "ready";
export function discoveryHref(event?: string, sport = "all", query = "") {
  const p = new URLSearchParams();
  if (event) p.set("event", event);
  if (sport !== "all") p.set("sport", sport);
  if (query) p.set("q", query);
  return `/staging/discovery${p.size ? `?${p}` : ""}`;
}
export function eventResearchHref(event: ResearchEvent) {
  return hubHref({
    sport: event.sport,
    event: event.key,
    query: "",
    date: "",
    topic: "all",
  });
}
export function findingHref(event: ResearchEvent, finding: Finding) {
  return hubHref({
    sport: event.sport,
    event: event.key,
    query: "",
    date: "",
    topic: finding.topic,
  });
}
export const fullMatchupHref = eventHref;
/** Only records actually returned by the existing authorized reader count as available. */
export function coverage(data: HubData, event: ResearchEvent) {
  if (data.denied)
    return data.signedIn ? "Research access required" : "Sign in for research";
  const count = data.findings.filter((f) => f.eventKey === event.key).length;
  const partial = data.truncated || data.errors.length > 0;
  if (count)
    return `${count} research ${count === 1 ? "item" : "items"}${partial ? " · partial coverage" : ""}`;
  return partial ? "Research availability unverified" : "No research returned";
}
export function compactText(text: string, limit = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) return normalized;
  const cut = normalized.slice(0, limit);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), limit - 30)) + "…";
}
export function chronologicalFindings(findings: Finding[]) {
  return [...findings].sort((a, b) => {
    const at = Date.parse(a.recordedAt || ""),
      bt = Date.parse(b.recordedAt || "");
    return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
  });
}
