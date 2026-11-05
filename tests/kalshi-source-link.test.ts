import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKalshiSourceLink as normalize } from "../src/lib/kalshi-source-link";
const path = "https://kalshi.com/markets/kxmvecrosscategory/combo/sample-combo";
const valid = path + "?marketTicker=SYNTHETIC-COMBO-YES";
test("only observed combo routes with a single exact locator normalize; tracking/actions are removed", () => {
  assert.equal(normalize(valid), valid);
  assert.equal(
    normalize(valid + "&utm_source=example&action=buy&order=YES#tracking"),
    valid,
  );
  assert.equal(
    normalize(valid.replace("kalshi.com", "www.kalshi.com")),
    valid.replace("kalshi.com", "www.kalshi.com"),
  );
});
test("reject malformed, encoded, ambiguous and arbitrary external destinations", () => {
  for (const value of [
    null,
    42,
    "",
    path,
    valid + "&marketTicker=OTHER",
    valid + "&MarketTicker=OTHER",
    valid + "&eventTicker=OTHER",
    valid.replace("https:", "http:"),
    valid.replace("kalshi.com", "kalshi.com.evil.example"),
    valid.replace("kalshi.com", "evil.example"),
    valid.replace("kalshi.com", "user@kalshi.com"),
    valid.replace("kalshi.com", "kalshi.com:443"),
    valid.replace("/markets/", "/x/../markets/"),
    valid.replace("/combo/", "/%63ombo/"),
    valid.replace("/combo/", "\\combo/"),
    valid + "\n",
    valid + "&x=%0a",
    valid.replace("?marketTicker=", "?marketTicker=" + "a".repeat(201)),
    valid + "a".repeat(2050),
  ])
    assert.equal(normalize(value), null, String(value));
});
