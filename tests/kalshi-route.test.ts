import test from "node:test";
import assert from "node:assert/strict";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://vq-kalshi-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
process.env.APP_URL = "https://vegasquant.app";
test("Kalshi route reads authoritative legs and never substitutes another target or a provider failure", async () => {
  const original = globalThis.fetch;
  let mode = "match",
    calls = 0;
  const kickoff = new Date(Date.now() + 86400000).toISOString();
  const { kalshiEvent } = await import("../src/lib/kalshi");
  const game = {
    id: "game",
    away_team: "Baltimore Ravens",
    home_team: "Cleveland Browns",
    kickoff,
    sport: "nfl",
  };
  const target = {
    player: "Tyler Huntley",
    target: 300,
    stat: "passing yards",
    series: "KXNFLPASSYDS",
  };
  const event = kalshiEvent(target, game)!;
  globalThis.fetch = async (input) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes("/auth/v1/user"))
      return Response.json({
        id: "user",
        email_confirmed_at: "2026-01-01T00:00:00Z",
      });
    if (u.includes("/rest/v1/published_legs"))
      return Response.json([
        {
          leg_key: "official:sample",
          name: "Tyler Huntley",
          market: "300+ passing yards",
          game_id: "game",
          expires_at: kickoff,
          result: null,
        },
      ]);
    if (u.includes("/rest/v1/games")) return Response.json([game]);
    if (u.startsWith("https://external-api.kalshi.com/")) {
      calls++;
      assert.equal(new URL(u).searchParams.get("event_ticker"), event);
      if (mode === "down") return new Response("", { status: 503 });
      return Response.json({
        cursor: "",
        markets: [
          {
            ticker: event + "-BALTHUNTLEY5-300",
            event_ticker: event,
            title: `Tyler Huntley: ${mode === "match" ? 300 : 250}+ passing yards`,
            status: "active",
            market_type: "binary",
            rules_primary:
              "If Tyler Huntley records 300+ passing yards in the Baltimore vs Cleveland Pro Football game",
            open_time: new Date(Date.now() - 60000).toISOString(),
            close_time: kickoff,
            floor_strike: 299.5,
            strike_type: "greater",
          },
        ],
      });
    }
    throw Error("Unexpected fetch " + u);
  };
  try {
    const { POST } = await import("../src/app/api/kalshi/route");
    const req = (auth = true, origin = "https://vegasquant.app") =>
      new Request("https://vegasquant.app/api/kalshi", {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          ...(auth ? { authorization: "Bearer sample" } : {}),
        },
        body: JSON.stringify({ keys: ["official:sample"] }),
      });
    assert.equal((await POST(req(false))).status, 401);
    assert.equal((await POST(req(true, "https://example.com"))).status, 403);
    let body = await (await POST(req())).json();
    assert.equal(body.results[0].status, "MATCH");
    assert.match(body.results[0].url, /^https:\/\/kalshi.com\/markets\//);
    mode = "other";
    body = await (await POST(req())).json();
    assert.equal(body.results[0].url, null);
    assert.equal(body.results[0].status, "NO_MATCH");
    mode = "down";
    body = await (await POST(req())).json();
    assert.equal(body.results[0].status, "UNAVAILABLE");
    assert.equal(body.results[0].url, null);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
  }
});

test("Typed legs match one exact open market across the series and never guess between games", async () => {
  const original = globalThis.fetch;
  const close = new Date(Date.now() + 86400000).toISOString();
  const market = (
    event: string,
    player: string,
    n: number,
    closes = close,
  ) => ({
    ticker: `${event}-${player.replace(/\W/g, "").toUpperCase()}-${n}`,
    event_ticker: event,
    title: `${player}: ${n}+ receiving yards`,
    status: "active",
    market_type: "binary",
    rules_primary: `If ${player} records ${n}+ receiving yards in the Sample Pro Football game`,
    open_time: new Date(Date.now() - 60000).toISOString(),
    close_time: closes,
    floor_strike: n - 0.5,
    strike_type: "greater",
  });
  const pages: Record<string, object> = {
    "": {
      cursor: "page2",
      markets: [
        market("KXNFLRECYDS-26OCT26SEADEN", "Sample Receiver", 50),
        market("KXNFLRECYDS-26OCT26SEADEN", "Twice Player", 40),
      ],
    },
    page2: {
      cursor: "",
      markets: [
        market("KXNFLRECYDS-26NOV02SEALAR", "Twice Player", 40),
        // Next week's game only: not this lay's game, so never linked.
        market(
          "KXNFLRECYDS-26NOV02SEALAR",
          "Later Player",
          30,
          new Date(Date.now() + 8 * 86400000).toISOString(),
        ),
      ],
    },
  };
  let seriesCalls = 0;
  globalThis.fetch = async (input) => {
    const u = String(input instanceof Request ? input.url : input);
    if (u.includes("/auth/v1/user"))
      return Response.json({
        id: "user",
        email_confirmed_at: "2026-01-01T00:00:00Z",
      });
    if (u.startsWith("https://external-api.kalshi.com/")) {
      const q = new URL(u).searchParams;
      assert.equal(q.get("series_ticker"), "KXNFLRECYDS");
      seriesCalls++;
      return Response.json(pages[q.get("cursor") || ""]);
    }
    throw Error("Unexpected fetch " + u);
  };
  try {
    const { POST } = await import("../src/app/api/kalshi/route");
    const res = await POST(
      new Request("https://vegasquant.app/api/kalshi", {
        method: "POST",
        headers: {
          origin: "https://vegasquant.app",
          "content-type": "application/json",
          authorization: "Bearer sample",
        },
        body: JSON.stringify({
          texts: [
            "Sample Receiver 50+ receiving yards",
            "Sample Receiver 60+ receiving yards",
            "Twice Player 40+ receiving yards",
            "Knicks moneyline",
            "Later Player 30+ receiving yards",
          ],
        }),
      }),
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.results, []);
    assert.deepEqual(
      body.text_results.map((r: { status: string }) => r.status),
      ["MATCH", "NO_MATCH", "NO_MATCH", "NO_MATCH", "NO_MATCH"],
    );
    assert.match(
      body.text_results[0].url,
      /^https:\/\/kalshi.com\/markets\/kxnflrecyds\//,
    );
    assert.equal(body.text_results[3].label, "Knicks moneyline");
    assert.equal(seriesCalls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
