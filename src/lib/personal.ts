export type PersonalAccount = { id: string; starting_cents: number };
export type PersonalEntry = {
  original?: PersonalEntry;
  correction_id?: string | null;
  corrected_at?: string | null;
  result?: "WIN" | "LOSS" | "PUSH" | "VOID" | null;
  profit_cents?: number | null;
  id: string;
  pick_id: string;
  line: number | null;
  odds: number;
  stake_cents: number;
  payout_cents: number;
  book: string;
  placed_at: string;
  created_at: string;
};
export type PersonalSettlement = {
  entry_id: string;
  result: "WIN" | "LOSS" | "PUSH" | "VOID";
  profit_cents: number;
};
export function personalTotals(
  starting: number,
  entries: PersonalEntry[],
  settlements: PersonalSettlement[],
) {
  const results = new Map(settlements.map((s) => [s.entry_id, s]));
  const net = entries.reduce(
    (n, e) => n + (results.get(e.id)?.profit_cents ?? 0),
    0,
  );
  const open = entries.filter((e) => !results.has(e.id));
  const inPlay = open.reduce((n, e) => n + e.stake_cents, 0);
  const payout = open.reduce((n, e) => n + e.payout_cents, 0);
  const balance = starting + net;
  return {
    balance,
    net,
    inPlay,
    payout,
    available: balance - inPlay,
    ifWin: balance - inPlay + payout,
    wins: entries.filter((e) => results.get(e.id)?.result === "WIN").length,
    losses: entries.filter((e) => results.get(e.id)?.result === "LOSS").length,
  };
}
