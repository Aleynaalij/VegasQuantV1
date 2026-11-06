import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import LegFormLine, { VqStamp } from "../src/components/leg-form";
test("historical screen stamp is descriptive in visible, tooltip and accessible text", () => {
  for (const compact of [false, true]) {
    const html = renderToStaticMarkup(createElement(VqStamp, { compact }));
    assert.match(
      html,
      /aria-label="Recent form screen; historical observations only"/,
    );
    assert.match(html, /title="Recent form and published-price screen only/);
    assert.doesNotMatch(
      html,
      /VQ APPROVED|Vegas Quant approved|passes every rule|✓/,
    );
    if (!compact) assert.match(html, /RECENT FORM/);
  }
  const html = renderToStaticMarkup(
    createElement(LegFormLine, {
      legKey: "sample",
      price: -200,
      market: "40+ rushing yards",
      data: {
        forms: {
          sample: { cleared: 5, sample: 5, median: 80, position: "RB" },
        },
        prices: { sample: { first: -200, last: -200 } },
        books: {},
        estimates: {},
        admin: false,
      },
    }),
  );
  assert.match(html, /RECENT FORM/);
  assert.match(html, /5 of last 5/);
  assert.doesNotMatch(html, /VQ APPROVED/);
});
