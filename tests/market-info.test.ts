import test from "node:test";
import assert from "node:assert/strict";
import { isMarketInfoUrl, marketInfoUrls } from "../src/lib/market-info";
test("only reviewed informational destinations are allowed", () => {
  for (const url of marketInfoUrls) assert.equal(isMarketInfoUrl(url), true);
  for (const url of [null, "", "javascript:alert(1)", "https://www.espn.com.evil.test/nfl/odds", "https://www.espn.com/nfl/odds?redirect=https://sportsbook.test", "https://www.espn.com/nfl/odds#betslip", "https://sportsbook.test/checkout"]) assert.equal(isMarketInfoUrl(url), false);
});
