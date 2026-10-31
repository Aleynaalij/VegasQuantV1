import type { SportMarket } from "./sport-contract";
export type Grade = "WIN" | "LOSS" | "PUSH" | "VOID" | "PENDING";
export type SportFinal = {
  status: string;
  away_score: number;
  home_score: number;
  players?: {
    athlete_id: string;
    played: boolean;
    participation_uncertain?: boolean;
    points: number | null;
    goals: number | null;
  }[];
};
/** No name guessing, DNP-as-zero, provisional final or conflicting evidence. */
export function gradeSportMarket(m: SportMarket, r: SportFinal): Grade {
  if (r.status !== "FINAL") return "PENDING";
  if (
    !Number.isInteger(r.away_score) ||
    !Number.isInteger(r.home_score) ||
    r.away_score === r.home_score
  )
    return "PENDING";
  let value: number;
  if (m.market === "h2h" || m.market === "spreads") {
    if (!m.side) return "PENDING";
    value =
      m.side === "home"
        ? r.home_score - r.away_score
        : r.away_score - r.home_score;
    if (m.market === "spreads") {
      if (m.line === null) return "PENDING";
      value += m.line;
    }
    return value > 0 ? "WIN" : value === 0 ? "PUSH" : "LOSS";
  }
  if (m.market === "totals") {
    value = r.home_score + r.away_score;
  } else {
    if (!m.athlete_id) return "PENDING";
    const p = r.players?.find((p) => p.athlete_id === m.athlete_id);
    if (!p) return "PENDING";
    if (p.participation_uncertain) return "PENDING";
    if (!p.played) return "VOID";
    const stat = m.market === "player_points" ? p.points : p.goals;
    if (stat === null || !Number.isFinite(stat)) return "PENDING";
    value = stat;
    if (m.market === "player_goal_scorer_anytime")
      return value > 0 ? "WIN" : "LOSS";
  }
  if (m.line === null || !["Over", "Under"].includes(m.direction || ""))
    return "PENDING";
  const diff = (value - m.line) * (m.direction === "Over" ? 1 : -1);
  return diff > 0 ? "WIN" : diff === 0 ? "PUSH" : "LOSS";
}
