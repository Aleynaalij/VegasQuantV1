import test from "node:test";
import assert from "node:assert/strict";
import { scorecardVerdict } from "../src/lib/shadow-scorecard";

test("The scorecard only calls a winner beyond two clustered standard errors", () => {
  // Live numbers from Oct 27: receiving all weeks, rushing all weeks, rushing week 7.
  assert.equal(
    scorecardVerdict({ brier_diff: "-0.0081", brier_diff_se: "0.0083" }),
    "Too close to call",
  );
  assert.equal(
    scorecardVerdict({ brier_diff: "0.0239", brier_diff_se: "0.0145" }),
    "Too close to call",
  );
  assert.equal(
    scorecardVerdict({ brier_diff: "0.0392", brier_diff_se: "0.0173" }),
    "Market beat the model",
  );
  assert.equal(
    scorecardVerdict({ brier_diff: -0.03, brier_diff_se: 0.01 }),
    "Model beat the market",
  );
  assert.equal(
    scorecardVerdict({ brier_diff: 0.01, brier_diff_se: null }),
    "Too few games",
  );
});
