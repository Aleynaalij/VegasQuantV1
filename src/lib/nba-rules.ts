/** The NBA Betting Bible — 2026-27 Edition, Part II "The Commandments" (R-01 to R-40). */
export type RuleGroup = { id: string; title: string };
export type BibleRule = {
  id: string;
  group: string;
  title: string;
  text: string;
};

export const ruleGroups: RuleGroup[] = [
  { id: "A", title: "Price and edge" },
  { id: "B", title: "Bankroll and staking" },
  { id: "C", title: "Process and records" },
  { id: "D", title: "Information and integrity" },
  { id: "E", title: "Psychology" },
];

const r = (n: number, title: string, text: string): BibleRule => ({
  id: `R-${String(n).padStart(2, "0")}`,
  group: ruleGroups[Math.floor((n - 1) / 8)].id,
  title,
  text,
});

export const bibleRules: BibleRule[] = [
  r(
    1,
    "No edge, no bet",
    "Write your fair price before you look at the posted line. If you cannot state a fair price, you cannot bet.",
  ),
  r(
    2,
    "Closing line value is the scoreboard",
    "Grade every bet against the no-vig closing price at the sharpest market you can see. Results are noise; CLV is signal.",
  ),
  r(
    3,
    "Shop every bet",
    "Take only the best price across every legal book and exchange you hold.",
  ),
  r(
    4,
    "Know your breakeven",
    "At -110 you must win 52.38%; at -105, 51.22%; at +100, 50%.",
  ),
  r(
    5,
    "Strip the vig before you read a market",
    "Convert both sides to no-vig probabilities and anchor to the sharpest market available.",
  ),
  r(
    6,
    "Respect the market",
    "When your number sits far from a sharp line, assume missing news or a data error until you prove otherwise.",
  ),
  r(
    7,
    "Minimum edge by market",
    "Starting thresholds: sides and totals 2%; first half, first quarter and team totals 3%; player props 4%; live and futures 5%.",
  ),
  r(
    8,
    "Parlays only with a reason",
    "Combine legs only when each is +EV alone or the book under-prices their correlation.",
  ),
  r(
    9,
    "Bankroll is risk capital",
    "Money you can lose entirely without changing your life, kept apart from bills and savings.",
  ),
  r(
    10,
    "One unit = 1% of bankroll",
    "Range 0.5–2%. Re-size units on a fixed calendar, never after a result.",
  ),
  r(
    11,
    "Size by edge with fractional Kelly",
    "Quarter-Kelly by default, half-Kelly at most, capped at 3% of bankroll per bet.",
  ),
  r(
    12,
    "Cap exposure",
    "At most 5% of bankroll on one game and 10–15% on one night. Correlated bets count as one position.",
  ),
  r(13, "Never chase", "A stake never rises because of a loss."),
  r(
    14,
    "Drawdown protocol",
    "Down 20% from peak: halve the unit and audit CLV. Down 30%: stop and review the model end to end.",
  ),
  r(
    15,
    "Expect the swings",
    "Even a true 55% bettor sees long drawdowns and losing months.",
  ),
  r(
    16,
    "Keep capital where the prices are",
    "Spread funds across venues so you can always take the best number.",
  ),
  r(
    17,
    "Log every bet",
    "Timestamp, venue, market, price taken, stake, fair price, closing price, result, reason code and source.",
  ),
  r(
    18,
    "Judge on the right sample",
    "CLV gives a usable read within a few hundred bets. Win rate needs far more.",
  ),
  r(
    19,
    "Backtest honestly",
    "Point-in-time data only, a held-out test set and walk-forward validation. Never mine trends.",
  ),
  r(
    20,
    "A pass is a position",
    "Log every pass and its reason. On many nights the right number of bets is zero.",
  ),
  r(21, "Specialize before you scale", "Own one lane before adding another."),
  r(
    22,
    "Review the process, not the result",
    "Was the price good? Was the information right? Was the size right?",
  ),
  r(
    23,
    "Change the model on evidence",
    "No changes mid-slate. Batch changes weekly, test out of sample and version every change.",
  ),
  r(
    24,
    "Watch edge decay",
    "Track CLV by market every month and cut volume when a lane's CLV fades.",
  ),
  r(
    25,
    "Verify at the primary source",
    "Every news item needs a timestamp and a primary source. Never bet a screenshot or a rumor.",
  ),
  r(
    26,
    "Never use inside information",
    "Do not use, buy or trade on non-public information from anyone with access.",
  ),
  r(
    27,
    "Never bet where you have access or influence",
    "If you or your family work for a team, the league or a data vendor, stay out of those markets.",
  ),
  r(
    28,
    "No proxy betting",
    "Never bet through someone else's account or let anyone use yours.",
  ),
  r(
    29,
    "Legal venues only",
    "Bet only where you are physically located in a jurisdiction that allows it.",
  ),
  r(
    30,
    "Publish honestly or not at all",
    "Post every pick, timestamped, with the price you took. No deleted losers, no invented records.",
  ),
  r(
    31,
    "Expect integrity monitoring",
    "Keep your model outputs; they show your bets came from analysis.",
  ),
  r(
    32,
    "Keep tax records from day one",
    "Winnings are taxable income; keep a record of every bet.",
  ),
  r(
    33,
    "Decide before tip-off",
    "Live bets come only from a written pre-game plan.",
  ),
  r(
    34,
    "No bets on tilt",
    "After a bad beat, wait at least an hour or until the next slate.",
  ),
  r(
    35,
    "Fade your fandom",
    "Skip your own team, or demand double the usual edge.",
  ),
  r(
    36,
    "Boredom is not a reason",
    "Volume without edge is a donation to the hold.",
  ),
  r(
    37,
    "Argue the other side",
    "Before any bet of 2 units or more, write the best case against it.",
  ),
  r(
    38,
    "A big story is not a big edge",
    "Revenge games and must-win narratives are already in the price.",
  ),
  r(
    39,
    "Grade at the close, not the buzzer",
    "A bet's quality is fixed when the market closes, never by the final score.",
  ),
  r(
    40,
    "Protect the operator",
    "Sleep, set deposit limits and take days off. A tired bettor misreads news.",
  ),
];

const byId = new Map(bibleRules.map((rule) => [rule.id, rule]));
export const findRule = (id: string) => byId.get(id);

/** Rule IDs (R-01…R-40) cited in free text, in first-mention order, without duplicates. */
export function citedRules(
  ...texts: (string | null | undefined)[]
): BibleRule[] {
  const seen = new Set<string>();
  const out: BibleRule[] = [];
  for (const text of texts) {
    for (const m of (text || "").matchAll(/\bR-(\d{2})\b/g)) {
      const id = `R-${m[1].padStart(2, "0")}`;
      const rule = byId.get(id);
      if (rule && !seen.has(id)) {
        seen.add(id);
        out.push(rule);
      }
    }
  }
  return out;
}
