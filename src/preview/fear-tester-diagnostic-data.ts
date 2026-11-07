import { supabase } from "@/lib/supabase";
import {
  testerFeatureAccess,
  testerObservationPage,
} from "@/lib/tester-research";
import { fearDetail } from "@/lib/vegas-fear-reader";
import type { FearEvent } from "@/lib/vegas-fear";

const features = ["fear", "research"] as const;
type Feature = (typeof features)[number];
type Sport = "nfl" | "nba";
type Section = "quotes" | "injury" | "context";
type Probe = { label: string } & (
  | { result: "ok"; rows: number }
  | { result: "denied" | "invalid scope" | "unavailable" }
);
type Eligibility = { feature: Feature; allowed: boolean | null };
type History = {
  rows: number;
  books: number;
  markets: number;
  reports: number;
  marketPartial: boolean;
  injuriesPartial: boolean;
};
type Evidence =
  | { state: "signed-out" }
  | {
      state: "complete";
      eligibility: Eligibility[];
      probes: Probe[];
      history: History | null;
    };

function safeStatus(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? error.code
      : null;
  if (code === "42501") return "denied";
  if (code === "22023") return "invalid scope";
  return "unavailable";
}

export async function diagnosticSignedIn(signal: AbortSignal) {
  signal.throwIfAborted();
  const { data, error } = await supabase.auth.getSession();
  signal.throwIfAborted();
  if (error) throw new Error("Session check unavailable");
  return Boolean(data.session);
}

export async function runFearTesterDiagnostic(
  event: FearEvent & { sport: Sport },
  signal: AbortSignal,
): Promise<Evidence> {
  if (!(await diagnosticSignedIn(signal))) return { state: "signed-out" };
  const now = Date.now();
  const eligibility = await Promise.all(
    features.map(async (feature): Promise<Eligibility> => {
      try {
        const { data, error } =
          await testerFeatureAccess(feature).abortSignal(signal);
        signal.throwIfAborted();
        return {
          feature,
          allowed: !error && typeof data === "boolean" ? data : null,
        };
      } catch (error) {
        signal.throwIfAborted();
        return { feature, allowed: null };
      }
    }),
  );
  signal.throwIfAborted();

  const probes: Promise<Probe>[] = [];
  const probe = async (
    feature: Feature,
    section: Section,
    label: string,
  ): Promise<Probe> => {
    try {
      const rows = await testerObservationPage(
        feature,
        event.sport,
        event.id,
        section,
        now,
        undefined,
        signal,
      );
      signal.throwIfAborted();
      return { label, result: "ok", rows: rows.length };
    } catch (error) {
      signal.throwIfAborted();
      return { label, result: safeStatus(error) };
    }
  };

  for (const { feature, allowed } of eligibility) {
    if (allowed === null) continue;
    // A false entitlement still gets one fixed probe to verify the server denies it.
    probes.push(probe(feature, "quotes", `${feature} quotes`));
    if (allowed) probes.push(probe(feature, "injury", `${feature} injuries`));
    if (allowed && feature === "research" && event.sport === "nfl")
      probes.push(probe(feature, "context", "research NFL context"));
    if (allowed && feature === "fear")
      probes.push(probe(feature, "context", "fear invalid context scope"));
  }

  const useFear = eligibility.some(
    ({ feature, allowed }) => feature === "fear" && allowed,
  );
  const [results, detail] = await Promise.all([
    Promise.all(probes),
    useFear ? fearDetail(event, now, supabase, signal, true) : null,
  ]);
  signal.throwIfAborted();
  const history = detail && {
    rows: detail.marketCoverage.rows,
    books: detail.marketCoverage.books,
    markets: detail.marketCoverage.markets,
    reports: detail.reports.length,
    marketPartial: detail.marketError || detail.marketTruncated,
    injuriesPartial: detail.contextError || detail.contextTruncated,
  };
  return { state: "complete", eligibility, probes: results, history };
}
