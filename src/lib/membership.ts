export type Access = {
  allowed: boolean;
  admin: boolean;
  admin_account?: boolean;
  member_code: string | null;
  expires_at: string | null;
};
export const noAccess: Access = {
  allowed: false,
  admin: false,
  member_code: null,
  expires_at: null,
};
export type Overview = {
  challenges: {
    id: string;
    number: number;
    status: string;
    current_stage: number;
    balance_cents: number;
    wins: number;
    losses: number;
  }[];
  stages: {
    stage_number: number;
    challenge_id: string;
    game_id: string | null;
    status: string;
  }[];
};
// Billing coverage units: regular-season weeks and postseason rounds, not individual bets.
// Tuesday noon UTC keeps Monday-night games within their round. Pro Bowl bye is not a round.
const regularEnds = Array.from({ length: 18 }, (_, i) =>
  Date.UTC(2026, 8, 15 + 7 * i, 12),
);
export const roundEnds = [
  ...regularEnds,
  Date.UTC(2027, 0, 19, 12),
  Date.UTC(2027, 0, 26, 12),
  Date.UTC(2027, 1, 2, 12),
  Date.UTC(2027, 1, 16, 12),
];
export const seasonEnd = roundEnds[roundEnds.length - 1];
export type Plan = "full" | "monthly";
export function passQuote(plan: Plan, now = Date.now()) {
  if (plan === "monthly")
    return {
      plan,
      amount: 500,
      season: "2026",
      recurring: true,
      expires_at: null,
    };
  if (now >= seasonEnd) return null;
  return {
    plan,
    amount: 2000,
    season: "2026",
    recurring: false,
    expires_at: new Date(seasonEnd).toISOString(),
  };
}
