// Automatic checks of a published leg against the standing selection rules in
// research/lessons/README.md. Rules that need judgement (R6 parlay construction, R4's score and
// second-half need) are not decided here.

export type RuleStatus = "pass" | "fail" | "unknown";
export type RuleCheck = { id: string; label: string; status: RuleStatus; detail: string };
export type LegForm = { cleared: number; sample: number; median: number | null; position: string | null };
export type RuleInput = {
  price: number | null;
  /** Latest market price before kickoff (closing price after kickoff). */
  lastPrice?: number | null;
  form?: LegForm | null;
  market: string;
  matchup?: string;
  pickOfDay?: boolean;
};

const validPrice = (p: number | null | undefined): p is number =>
  typeof p === "number" && Number.isFinite(p) && Math.abs(p) >= 100;

/** Win rate the price needs to break even, in percent. */
export const breakEven = (price: number) =>
  (price < 0 ? -price / (-price + 100) : 100 / (price + 100)) * 100;

/** American odds on a straight "cents" scale, so -110 to +110 is 20 cents. */
const cents = (price: number) => (price < 0 ? price + 100 : price - 100);

/** "Cleared 4 of last 5 · median 62" */
export const formLine = (f: LegForm, unit: string) =>
  `Cleared ${f.cleared} of last ${f.sample}${f.median === null ? "" : ` · median ${Math.round(f.median * 10) / 10}${unit ? ` ${unit}` : ""}`}`;

export const statUnit = (market: string) =>
  /receptions/i.test(market) ? "rec" : /yards/i.test(market) ? "yds" : "";

export function checkLeg(l: RuleInput): RuleCheck[] {
  const price = validPrice(l.price) ? l.price : null;
  const out: RuleCheck[] = [];
  if (price === null) {
    out.push({ id: "R8", label: "Exact price", status: "fail", detail: "No exact book price recorded" });
    return out;
  }
  const be = breakEven(price);
  // R1: recent clear rate must beat the price's break-even by 5 points (needs 5+ games).
  if (!l.form || l.form.sample < 5)
    out.push({
      id: "R1",
      label: "Form beats price",
      status: "unknown",
      detail: l.form ? `Only ${l.form.sample} prior games` : "No game history",
    });
  else {
    const rate = (l.form.cleared / l.form.sample) * 100;
    out.push({
      id: "R1",
      label: "Form beats price",
      status: rate >= be + 5 ? "pass" : "fail",
      detail: `${Math.round(rate)}% cleared vs ${Math.round(be)}% break-even (+5 needed)`,
    });
  }
  // R2: no near-even-money props without a priced model.
  out.push({
    id: "R2",
    label: "Price band",
    status: price <= -150 ? "pass" : "fail",
    detail: price <= -150 ? "Priced -150 or shorter" : "Near even money (-149 or longer) without a model edge",
  });
  // R3: Pick of the Day -150 to -300; -500 or shorter is an anchor only.
  if (l.pickOfDay)
    out.push({
      id: "R3",
      label: "Pick of the Day price",
      status: price <= -150 && price >= -300 ? "pass" : "fail",
      detail: price < -300 ? "Too short for a Pick of the Day (-150 to -300)" : price > -150 ? "Too long for a Pick of the Day (-150 to -300)" : "Within -150 to -300",
    });
  else if (price <= -500)
    out.push({ id: "R3", label: "Heavy chalk", status: "fail", detail: "-500 or shorter: parlay anchor only, not a standalone pick" });
  // R4: halftime legs are overs priced -150 to -249.
  if (/halftime/i.test(`${l.matchup || ""} ${l.market}`)) {
    const under = /\bunder\b/i.test(l.market);
    out.push({
      id: "R4",
      label: "Halftime discipline",
      status: !under && price <= -150 && price >= -249 ? "pass" : "fail",
      detail: under ? "No halftime unders" : price <= -150 && price >= -249 ? "Over priced -150 to -249; check the lead and second-half need" : "Halftime legs must be priced -150 to -249",
    });
  }
  // R5: tight ends use receptions, not low yardage targets.
  const target = Number(/(\d+(?:\.\d+)?)\+/.exec(l.market)?.[1] ?? /(?:over|under)\s+(\d+(?:\.\d+)?)/i.exec(l.market)?.[1]);
  if (l.form?.position === "TE" && /receiving yards/i.test(l.market) && target <= 20)
    out.push({ id: "R5", label: "Tight end", status: "fail", detail: "Low tight-end yardage target; use receptions" });
  // R7: a 15+ cent move against the pick before kickoff.
  if (validPrice(l.lastPrice)) {
    const move = cents(l.lastPrice) - cents(price);
    out.push({
      id: "R7",
      label: "Price held",
      status: move >= 15 ? "fail" : "pass",
      detail: move >= 15 ? `Moved ${move} cents against (${l.lastPrice > 0 ? "+" : ""}${l.lastPrice})` : move > 0 ? `Moved ${move} cents against` : "No move against",
    });
  }
  return out;
}

/** "pass" only when every check passes, "fail" when any fails, otherwise "unknown". */
export const verdict = (checks: RuleCheck[]): RuleStatus =>
  checks.some((c) => c.status === "fail") ? "fail" : checks.every((c) => c.status === "pass") ? "pass" : "unknown";

export type BookPrice = { book: string; price: number };
/** Units won per unit staked at American odds. */
const payout = (price: number) => (price > 0 ? price / 100 : 100 / -price);
/** Books ordered best price first (highest payout); ties keep alphabetical order. */
export const bestPrices = (prices: BookPrice[]) =>
  [...prices]
    .filter((p) => Number.isFinite(p.price) && Math.abs(p.price) >= 100)
    .sort((a, b) => payout(b.price) - payout(a.price) || a.book.localeCompare(b.book));

/** Points a recommended leg's recent clear rate must beat its price's break-even by. */
export const STAMP_EDGE = 15;
/**
 * The Vegas Quant stamp: a leg that passes every automatic rule (so it has 5+ games of form and its
 * price has not moved 15 cents against it) and whose recent clear rate beats the price's break-even
 * by at least STAMP_EDGE points. Judged at the published price, never a later quote.
 */
export function stamped(l: RuleInput): boolean {
  if (!validPrice(l.price) || !l.form || l.form.sample < 5) return false;
  if (verdict(checkLeg(l)) !== "pass") return false;
  return (l.form.cleared / l.form.sample) * 100 - breakEven(l.price) >= STAMP_EDGE;
}
