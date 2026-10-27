import test from "node:test";
import assert from "node:assert/strict";
import {
  kalshiTarget,
  kalshiEvent,
  exactKalshiMarket,
  kalshiMarketUrl,
  type KalshiMarket,
} from "../src/lib/kalshi";
test("Kalshi requires exact full-game player, threshold, date and market semantics", () => {
  const t = kalshiTarget("Tyler Huntley", "Full game · 300+ passing yards")!;
  assert.equal(t.series, "KXNFLPASSYDS");
  const e = kalshiEvent(t, {
    away_team: "Baltimore Ravens",
    home_team: "Cleveland Browns",
    kickoff: "2026-10-18T17:00:00Z",
  })!;
  assert.equal(e, "KXNFLPASSYDS-26OCT18BALCLE");
  const m: KalshiMarket = {
    ticker: e + "-BALTHUNTLEY5-300",
    event_ticker: e,
    title: "Tyler Huntley: 300+ passing yards",
    status: "active",
    market_type: "binary",
    rules_primary:
      "If Tyler Huntley records 300+ passing yards in the Baltimore vs Cleveland Pro Football game originally scheduled for Oct 18, 2026, then the market resolves to Yes.",
    open_time: "2026-10-16T18:15:00Z",
    close_time: "2026-10-20T17:00:00Z",
    floor_strike: 299.5,
    strike_type: "greater",
  };
  const now = Date.parse("2026-10-17T01:00:00Z");
  assert.equal(exactKalshiMarket(t, e, [m], now), m);
  for (const patch of [
    { title: "Tyler Huntley: 250+ passing yards" },
    { event_ticker: e.replace("18", "19") },
    { market_type: "scalar" },
    { floor_strike: 300 },
    { status: "settled" },
    { rules_primary: "Different settlement." },
    { title: "Lamar Jackson: 300+ passing yards" },
  ])
    assert.equal(exactKalshiMarket(t, e, [{ ...m, ...patch }], now), undefined);
  const u = new URL(kalshiMarketUrl(m));
  assert.equal(u.hostname, "kalshi.com");
  assert.equal(u.searchParams.get("op_market_ticker"), m.ticker);
  assert.equal(u.searchParams.size, 1);
  for (const market of [
    "1st half · 300+ passing yards",
    "Under 300 passing yards",
    "over 299.5 passing yards",
    "300 passing yards",
  ])
    assert.equal(kalshiTarget("Tyler Huntley", market), null);
  assert.equal(
    kalshiTarget("Evan Engram 3+ receptions", "Player Prop")?.target,
    3,
  );
});

test("Typed player props parse to a stat and leave the series to Kalshi's catalog", async () => {
  const { propSeries } = await import("../src/lib/kalshi");
  assert.deepEqual(kalshiTarget("Sample Star 25+ points", "Player Prop"), {
    player: "Sample Star",
    target: 25,
    stat: "points",
    series: "",
  });
  assert.equal(
    kalshiTarget("Sample Star 8+ reb", "Player Prop")!.stat,
    "rebounds",
  );
  assert.equal(
    kalshiTarget("Sample Star 3+ 3-pointers", "Player Prop")!.stat,
    "threes",
  );
  assert.deepEqual(kalshiTarget("Sample Back anytime TD", "Player Prop"), {
    player: "Sample Back",
    target: 1,
    stat: "touchdowns",
    series: "",
  });
  assert.equal(
    kalshiTarget("Sample QB 2+ passing TDs", "Player Prop")!.stat,
    "passing touchdowns",
  );
  // Known NFL yardage series stay fixed; unknown words and unders never parse.
  assert.equal(
    kalshiTarget("Sample WR 50+ receiving yards", "Player Prop")!.series,
    "KXNFLRECYDS",
  );
  assert.equal(kalshiTarget("Sample Star 25+ vibes", "Player Prop"), null);
  assert.equal(
    kalshiTarget("Sample Star under 25.5 points", "Player Prop"),
    null,
  );
  assert.equal(kalshiTarget("Knicks moneyline", "Player Prop"), null);
  assert.ok(propSeries("points", "KXNBAPTS", "Pro Basketball player points"));
  assert.ok(propSeries("points", "KXWNBAPOINTS", "WNBA player points"));
  assert.ok(
    propSeries("touchdowns", "KXNFLTD", "Pro Football anytime touchdown"),
  );
  assert.equal(
    propSeries("touchdowns", "KXNFLPASSTD", "Pro Football passing touchdowns"),
    false,
  );
  assert.equal(propSeries("points", "KXNCAAFPTS", "College points"), false);
});
