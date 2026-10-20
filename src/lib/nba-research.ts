// NBA research board helpers: the target a member copies and the separate research record.
const STAT = { player_points: "points", player_rebounds: "rebounds" } as const;
/** "Over 24.5 points" is shown as the target a member copies: 25+ points. */
export const nbaTarget = (l: { line: number; market: "player_points" | "player_rebounds" }) =>
  `${Math.floor(l.line) + 1}+ ${STAT[l.market]}`;
export const signed = (p: number) => (p > 0 ? `+${p}` : String(p));

/** The research record: wins, losses and pushes so far; voids and pending legs are not counted. */
export function nbaResearchRecord(legs: { result: string }[]) {
  const n = (r: string) => legs.filter((l) => l.result === r).length;
  return { wins: n("WIN"), losses: n("LOSS"), pushes: n("PUSH"), pending: n("PENDING") + n("REVIEW") };
}

