import type { CasinoCardData } from "./casino-card";
export type AnalystLeg = {
  game_id: string;
  name: string;
  market: string;
  copy_text: string;
  odds: number;
  book: string;
  quote_observed_at: string;
  quote_source_url: string;
  selection_gate: {
    opportunity_case: string;
    failure_path: string;
    game_script_review: string;
    role_source_url: string;
    availability_source_url: string;
    history_source_url: string;
  };
};
export type AnalystDoubleUp = {
  id: string;
  day: string;
  title: string;
  candidates: AnalystLeg[];
  sportsbook: string;
  combined_odds: number;
  source_url: string;
  observed_at: string;
  expires_at: string;
  created_at: string;
  review: {
    generated_at: string;
    historical_cutoff: string;
    correlation_review: string;
    failure_scenarios: string;
    market_context: string;
    material_unknowns: string;
    sources: { url: string; retrieved_at: string; sha256: string }[];
  };
};
export function analystCard(ticket: AnalystDoubleUp): CasinoCardData {
  return {
    variant: "parlay",
    eyebrow: "VEGAS QUANT · ANALYST PICK",
    title: ticket.title,
    market: "Today’s Double Up",
    price: `${ticket.sportsbook} +${ticket.combined_odds}`,
    legs: ticket.candidates.map((leg) => ({
      name: leg.name,
      market: leg.market,
    })),
    footnote:
      "Research-based opinion · No validated model edge · Returns are not guaranteed",
    publishedAt: ticket.created_at,
  };
}
export const analystCopy = (ticket: AnalystDoubleUp) =>
  ticket.candidates.map((leg) => leg.copy_text).join("\n");
export function analystOpen(ticket: AnalystDoubleUp, now = Date.now()) {
  return (
    Number.isFinite(Date.parse(ticket.expires_at)) &&
    now < Date.parse(ticket.expires_at)
  );
}
