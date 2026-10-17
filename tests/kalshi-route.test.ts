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
