import { z } from "zod";
export const sections = [
  "Market Tape",
  "Sharp Consensus",
  "Retail Consensus",
  "Public vs Sharp",
  "Model vs Market",
  "News Tape",
  "CLV Tracker",
] as const;
export const sharpBooks = ["Circa", "Pinnacle", "Bookmaker"];
export const retailBooks = ["DraftKings", "FanDuel", "BetMGM"];
export const books = [...sharpBooks, ...retailBooks];
export type IntelMarket = {
  id: string;
  game_id: string;
  market_key: string;
  label: string;
  market_type: string;
  selection: string;
  opposite: string;
  period: string;
  rules: string;
  official_pick_id?: string | null;
};
export type Quote = {
  id: string;
  market_id: string;
  book: string;
  line: number | null;
  odds: number;
  opposite_odds: number | null;
  observed_at: string;
  created_at: string;
  time_basis: string;
  source: string;
  notes: string;
};
export type Split = {
  id: string;
  market_id: string;
  book: string;
  line: number | null;
  ticket_pct: number | null;
  handle_pct: number | null;
  sample_size: number | null;
  sample_window: string;
  observed_at: string;
  created_at: string;
  time_basis: string;
  source: string;
  notes: string;
};
export type News = {
  id: string;
  game_id: string;
  category: string;
  headline: string;
  body: string;
  observed_at: string;
  time_basis: string;
  source: string;
  created_at: string;
};
export type Model = {
  id: string;
  market_id: string;
  true_line: number | null;
  projection: string;
  probability: number | null;
  probability_line: number | null;
  sharp_fair_line: number | null;
  sharp_method: string | null;
  observed_at: string;
  source: string;
  notes: string;
  created_at: string;
};
export const impliedProbability = (odds: number) =>
  odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
export const probabilityOdds = (p: number) =>
  p > 0 && p < 1
    ? p >= 0.5
      ? (-100 * p) / (1 - p)
      : (100 * (1 - p)) / p
    : null;
export function noVig(a: number, b: number | null) {
  if (
    b === null ||
    ![a, b].every(
      (x) => Number.isFinite(x) && Math.abs(x) >= 100 && Math.abs(x) <= 100000,
    )
  )
    return null;
  const x = impliedProbability(a),
    y = impliedProbability(b);
  return { probability: x / (x + y), margin: (x + y - 1) * 100 };
}
export function latestByBook<
  T extends { book: string; observed_at: string; created_at: string },
>(rows: T[], asOf: number) {
  const sorted = rows
    .filter((r) => Date.parse(r.observed_at) <= asOf)
    .sort(
      (a, b) =>
        Date.parse(b.observed_at) - Date.parse(a.observed_at) ||
        Date.parse(b.created_at) - Date.parse(a.created_at),
    );
  return [
    ...new Map(sorted.map((r) => [r.book, r] as const).reverse()).values(),
  ];
}
export function consensus(
  quotes: Quote[],
  bookList: string[],
  line: number | null,
  asOf: number,
  maxMinutes = 15,
) {
  const latest = latestByBook(
    quotes.filter((q) => bookList.includes(q.book)),
    asOf,
  );
  const eligible = latest.filter(
    (q) =>
      q.time_basis === "observed" &&
      asOf - Date.parse(q.observed_at) <= maxMinutes * 60000 &&
      q.line === line,
  );
  const paired = eligible.flatMap((q) => {
    const n = noVig(q.odds, q.opposite_odds);
    return n ? [{ q, ...n }] : [];
  });
  const avg = (a: number[]) =>
    a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  return {
    latest,
    eligible,
    paired,
    rawProbability:
      eligible.length >= 2
        ? avg(eligible.map((q) => impliedProbability(q.odds)))
        : null,
    fairProbability:
      paired.length >= 2 ? avg(paired.map((x) => x.probability)) : null,
    missing: bookList.filter((b) => !eligible.some((q) => q.book === b)),
  };
}
export function newsContext(news: News, quotes: Quote[], book: string) {
  const at = Date.parse(news.observed_at);
  const rows = quotes
    .filter(
      (q) =>
        q.book === book &&
        q.time_basis === "observed" &&
        Math.abs(Date.parse(q.observed_at) - at) <= 3600000,
    )
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  return {
    before: rows.filter((q) => Date.parse(q.observed_at) <= at).at(-1),
    after: rows.find((q) => Date.parse(q.observed_at) > at),
  };
}
const text = (n: number) => z.string().trim().min(1).max(n);
const nullableNum = z.number().finite().min(-100000).max(100000).nullable();
const odds = z
  .number()
  .finite()
  .refine(
    (x) => Math.abs(x) >= 100 && Math.abs(x) <= 100000,
    "American odds must be ±100 or greater.",
  );
const observed = z
  .string()
  .datetime({ offset: true })
  .refine(
    (x) => Date.parse(x) <= Date.now() + 300000,
    "Timestamp cannot be in the future.",
  );
const basis = z.enum(["observed", "received", "published"]);
const meta = { observed_at: observed, source: text(2000) };
export const inputSchemas = {
  markets: z
    .object({
      game_id: z.string().uuid(),
      market_key: text(120).regex(
        /^[a-z0-9-]+$/,
        "Use lowercase letters, digits and hyphens.",
      ),
      label: text(200),
      market_type: z.enum(["Side", "Moneyline", "Total", "Player Prop"]),
      selection: text(200),
      opposite: text(200),
      period: text(100),
      rules: text(2000),
    })
    .strict()
    .refine(
      (x) => x.selection !== x.opposite,
      "Opposite outcomes must differ.",
    ),
  quotes: z
    .object({
      market_id: z.string().uuid(),
      book: text(100),
      line: nullableNum,
      odds,
      opposite_odds: odds.nullable(),
      time_basis: basis,
      ...meta,
      notes: z.string().max(10000),
    })
    .strict(),
  splits: z
    .object({
      market_id: z.string().uuid(),
      book: text(100),
      line: nullableNum,
      ticket_pct: z.number().finite().min(0).max(100).nullable(),
      handle_pct: z.number().finite().min(0).max(100).nullable(),
      sample_size: z.number().int().positive().nullable(),
      sample_window: text(500),
      time_basis: basis,
      ...meta,
      notes: z.string().max(10000),
    })
    .strict()
    .refine(
      (x) => x.ticket_pct !== null || x.handle_pct !== null,
      "Supply tickets or handle.",
    ),
  news: z
    .object({
      game_id: z.string().uuid(),
      category: z.enum(["Injury", "Weather", "Team", "Other"]),
      headline: text(300),
      body: text(20000),
      time_basis: basis,
      ...meta,
    })
    .strict(),
  models: z
    .object({
      market_id: z.string().uuid(),
      true_line: nullableNum,
      projection: text(2000),
      probability: z.number().finite().min(0).max(100).nullable(),
      probability_line: nullableNum,
      sharp_fair_line: nullableNum,
      sharp_method: z.string().max(2000).nullable(),
      ...meta,
      notes: z.string().max(10000),
    })
    .strict()
    .refine(
      (x) => x.sharp_fair_line === null || Boolean(x.sharp_method?.trim()),
      "A supplied sharp fair line needs its source and method.",
    ),
};
export type IntelKind = keyof typeof inputSchemas;
