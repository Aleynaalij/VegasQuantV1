import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KALSHI_ENABLED,
  KALSHI_PAUSED_MESSAGE,
  actionableKalshiSource,
} from "../src/lib/kalshi-availability";
import { normalizeKalshiSourceLink } from "../src/lib/kalshi-source-link";
import KalshiLink from "../src/components/kalshi-link";
import KalshiSourceLink from "../src/components/kalshi-source-link";
import GamblyLink from "../src/components/gambly-link";
import { POST } from "../src/app/api/kalshi/route";

const source =
  "https://kalshi.com/markets/kxmvecrosscategory/combo/sample-combo?marketTicker=SYNTHETIC-YES";

test("Kalshi is paused in source, while historical link validation remains intact", () => {
  assert.equal(KALSHI_ENABLED, false);
  assert.equal(normalizeKalshiSourceLink(source), source);
  assert.equal(actionableKalshiSource(source), null);
  assert.equal(actionableKalshiSource(null), null);
});

test("paused matching route fails closed before auth, body parsing, data or provider requests", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("Paused route must not make a network request");
  };
  try {
    for (const body of [
      '{"keys":["official:sample"]}',
      '{"texts":["Sample Player 20+ points"]}',
      "invalid-json",
    ]) {
      const response = await POST(
        new Request("https://vegasquant.app/api/kalshi", {
          method: "POST",
          body,
          headers: { authorization: "Bearer stale-client" },
        }),
      );
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.deepEqual(await response.json(), {
        code: "KALSHI_PAUSED",
        error: KALSHI_PAUSED_MESSAGE,
      });
    }
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test("matching entry points render nothing, including generic browsing and screenshot-only", () => {
  for (const props of [
    {},
    { legKeys: ["official:sample"] },
    { texts: ["Sample Player 20+ points"] },
  ])
    assert.equal(renderToStaticMarkup(createElement(KalshiLink, props)), "");
});

test("existing source-only cards retain readable provenance without links, controls or raw locators", () => {
  const html = renderToStaticMarkup(
    createElement(KalshiSourceLink, { source }),
  );
  assert.match(html, /Contributor-shared Kalshi link/);
  assert.ok(html.includes(KALSHI_PAUSED_MESSAGE));
  assert.match(html, /original shared link is retained/);
  assert.doesNotMatch(html, /<a\b|<button\b|<input\b|https:|marketTicker/);
  assert.equal(
    renderToStaticMarkup(
      createElement(KalshiSourceLink, { source: "https://evil.example/" }),
    ),
    "",
  );
});

test("Gambly keeps its existing action while the sibling Kalshi action is absent", () => {
  const html = renderToStaticMarkup(
    createElement(GamblyLink, {
      url: "https://gambly.com/",
      selection: "Sample Player 20+ points",
      kalshiLegKeys: ["official:sample"],
    }),
  );
  assert.match(html, /Copy pick &amp; open Gambly/);
  assert.match(html, /I confirm I am 21 or older/);
  assert.doesNotMatch(html, /Kalshi|kalshi\.com|Open selections/);
});
