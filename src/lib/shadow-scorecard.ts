/**
 * Plain-language result for a model-minus-market Brier difference. A gap within two game-clustered
 * standard errors of zero is not evidence either way.
 */
export function scorecardVerdict(r: {
  brier_diff: number | string;
  brier_diff_se: number | string | null;
}) {
  const diff = Number(r.brier_diff);
  const se = r.brier_diff_se == null ? NaN : Number(r.brier_diff_se);
  if (!Number.isFinite(se) || !Number.isFinite(diff)) return "Too few games";
  if (diff <= -2 * se) return "Model beat the market";
  if (diff >= 2 * se) return "Market beat the model";
  return "Too close to call";
}
