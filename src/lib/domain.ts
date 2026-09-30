export type Game = {
  id: string;
  slug: string;
  away_team: string;
  home_team: string;
  kickoff: string;
  venue: string;
  slot: string;
  created_at: string;
};
export type Challenge = {
  id: string;
  number: number;
  name: string;
  starting_cents: number;
  target_cents: number;
  balance_cents: number;
  status: string;
  current_stage: number;
  pause_reason: string | null;
  created_at: string;
};
export type Stage = {
  id: string;
  challenge_id: string;
  stage_number: number;
  slot: string;
  game_id: string | null;
  status: string;
  pass_reason: string | null;
};
export type Market = {
  id: string;
  game_id: string;
  observed_at: string;
  created_at: string;
  source: string;
  spread: string | null;
  moneyline: string | null;
  total: string | null;
  kind: "opening" | "current";
  notes: string | null;
};
export const sectionNames = [
  "Game Summary",
  "Market",
  "Team Strength",
  "QB Analysis",
  "Offensive Line",
  "Defensive Matchups",
  "Injuries",
  "Weather",
  "Situational Factors",
  "Public vs Sharp",
  "Bias Check",
  "Sportsbook Fear Index",
  "Vegas Quant Projection",
  "Edge Analysis",
  "Why the Bet Could Lose",
] as const;
export const sectionHints: Record<string, string> = {
  Market: "Opening/current spread, ML, total; line movement.",
  "Team Strength":
    "Offensive EPA, Defensive EPA, Success Rate, Early Down Success, Yards Per Play, Points Per Drive, Explosive Plays, Turnovers, Red Zone, Third Down.",
  Injuries: "Tier 1 / Tier 2 / Tier 3. Football impact and market impact.",
  Weather: "Wind, rain, snow, temperature, estimated point impact.",
  "Situational Factors":
    "Short week, rest, travel, division, revenge, lookahead, letdown, coaching.",
};
export type Analysis = {
  id: string;
  game_id: string;
  version: number;
  title: string;
  sections: Record<string, string>;
  projections: Record<string, string>;
  raw_handoff: string;
  source: string;
  created_at: string;
};
export type Pick = {
  market_info_url?: string | null;
  id: string;
  game_id: string;
  stage_id: string | null;
  analysis_id: string;
  market: "Side" | "Total" | "Player Prop" | "Moneyline";
  selection: string;
  recommended_line: number | null;
  direction: "over" | "under" | null;
  odds: number;
  stake_cents: number;
  model_probability: number;
  market_probability: number;
  edge: number;
  confidence: number;
  risk: number;
  predicted_close: string;
  best_number: string;
  bet_grade: string;
  fear_index: number;
  timing: string;
  why_like: string;
  why_lose: string;
  playable_number: string;
  pass_number: string;
  book: string;
  raw_handoff: string;
  known_at_publication: Record<string, unknown>;
  created_at: string;
};
export type Entry = {
  id: string;
  pick_id: string;
  line: number | null;
  odds: number;
  source: string;
  bet_at: string;
  created_at: string;
};
export type Closing = {
  id: string;
  pick_id: string;
  line: number | null;
  odds: number;
  source: string;
  observed_at: string;
  created_at: string;
};
export type Result = {
  id: string;
  pick_id: string;
  result: "WIN" | "LOSS" | "PUSH" | "VOID";
  away_score: number;
  home_score: number;
  profit_cents: number;
  bankroll_cents: number | null;
  source: string;
  created_at: string;
};
export type Review = {
  id: string;
  pick_id: string;
  grade: "A" | "B" | "C" | "D" | "F";
  classification: string;
  lessons: string;
  created_at: string;
};
export type Transaction = {
  id: string;
  challenge_id: string;
  pick_id: string | null;
  kind: string;
  amount_cents: number;
  balance_cents: number;
  created_at: string;
};
export type Audit = {
  id: string;
  entity: string;
  entity_id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
};
export type Desk = {
  games: Game[];
  challenges: Challenge[];
  stages: Stage[];
  markets: Market[];
  analyses: Analysis[];
  picks: Pick[];
  entries: Entry[];
  closings: Closing[];
  results: Result[];
  reviews: Review[];
  transactions: Transaction[];
  audit: Audit[];
};
export const emptyDesk: Desk = {
  games: [],
  challenges: [],
  stages: [],
  markets: [],
  analyses: [],
  picks: [],
  entries: [],
  closings: [],
  results: [],
  reviews: [],
  transactions: [],
  audit: [],
};
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const signedMoney = (cents: number) =>
  `${cents >= 0 ? "+" : "−"}${money(Math.abs(cents))}`;
export const odd = (n: number) => `${n > 0 ? "+" : ""}${n}`;
export const lineText = (n: number | null) =>
  n === null ? "—" : `${n > 0 ? "+" : ""}${n}`;
export const decimalOdds = (n: number) =>
  n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
export const implied = (n: number) => 100 / decimalOdds(n);
export const winProfit = (stake: number, odds: number) =>
  Math.round(stake * (odds > 0 ? odds / 100 : 100 / Math.abs(odds)));
export const time = (s: string) =>
  new Date(s).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
export function clv(p: Pick, e: Entry | undefined, c: Closing | undefined) {
  if (!e || !c) return { price: null, points: null, key: null };
  const points =
    p.market === "Side"
      ? c.line !== null && e.line !== null
        ? e.line - c.line
        : null
      : p.market === "Total" || p.market === "Player Prop"
        ? c.line !== null && e.line !== null
          ? p.direction === "under"
            ? e.line - c.line
            : c.line - e.line
          : null
        : null;
  const price =
    e.line === c.line
      ? (decimalOdds(e.odds) / decimalOdds(c.odds) - 1) * 100
      : null;
  let key: string | null = null;
  if (p.market === "Side" && e.line !== null && c.line !== null) {
    const crossed = [3, 7].filter((k) =>
      [-k, k].some(
        (n) =>
          Math.min(e.line!, c.line!) <= n &&
          Math.max(e.line!, c.line!) >= n &&
          e.line !== c.line,
      ),
    );
    if (crossed.length)
      key = `Key ${crossed.join(" / ")}: ${e.line < c.line ? "waiting offered a better number" : "entry beat the close"}`;
  }
  return { price, points, key };
}
export const gradePoints: Record<string, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};
export const classifications = [
  "GOOD HANDICAP / GOOD RESULT",
  "GOOD HANDICAP / BAD VARIANCE",
  "BAD HANDICAP / DESERVED LOSS",
  "CORRECT READ / WRONG EXECUTION",
];
export function metrics(d: Desk, picks: Pick[] = d.picks) {
  const rows = picks.map((p) => ({
    p,
    r: d.results.find((r) => r.pick_id === p.id),
    e: d.entries.find((e) => e.pick_id === p.id),
    c: d.closings.find((c) => c.pick_id === p.id),
    review: d.reviews.find((r) => r.pick_id === p.id),
  }));
  const resolved = rows.filter((x) => x.r),
    wins = resolved.filter((x) => x.r?.result === "WIN").length,
    losses = resolved.filter((x) => x.r?.result === "LOSS").length,
    net = resolved.reduce((s, x) => s + x.r!.profit_cents, 0),
    risked = resolved
      .filter((x) => ["WIN", "LOSS", "PUSH"].includes(x.r!.result))
      .reduce((s, x) => s + x.p.stake_cents, 0);
  const prices = rows
    .map((x) => clv(x.p, x.e, x.c).price)
    .filter((v): v is number => v !== null);
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    wins,
    losses,
    net,
    winRate: wins + losses ? (wins / (wins + losses)) * 100 : null,
    roi: risked ? (net / risked) * 100 : null,
    avgEdge: avg(picks.map((p) => p.edge)),
    avgConfidence: avg(picks.map((p) => p.confidence)),
    avgGrade: avg(
      rows.filter((r) => r.review).map((r) => gradePoints[r.review!.grade]),
    ),
    avgClv: avg(prices),
    clvWinRate: prices.length
      ? (prices.filter((x) => x > 0).length / prices.length) * 100
      : null,
  };
}
