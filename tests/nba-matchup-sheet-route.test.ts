import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

test("source-only matchup publications render the existing sheet with unchanged access and game binding", async () => {
  const original = globalThis.fetch;
  const game = {
    id: "00000000-0000-4000-8000-000000000001",
    slug: "ny-cle-20261109",
    provider_id: "123456789",
    away_team: "New York Knicks",
    home_team: "Cleveland Cavaliers",
    away_abbreviation: "NY",
    home_abbreviation: "CLE",
    tipoff: "2026-11-10T00:00:00Z",
    tipoff_tbd: false,
    venue: "Synthetic arena",
    season: 2027,
    season_type: 2,
    status: "STATUS_SCHEDULED",
    away_score: null,
    home_score: null,
  };
  const hash = createHash("md5")
    .update(`nba-matchup-cheat-sheet:2026-11-09:${game.id}`)
    .digest("hex");
  const id = hash.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
  const post = {
    id,
    title: `NBA Matchup Cheat Sheet · ${game.away_team} @ ${game.home_team}`,
    card: "vq-publication:v1",
    sport: "nba",
    legs: [],
    created_at: "2026-11-09T20:44:00Z",
    body: "Injury report (3:30 PM ET): Synthetic report wording.\n\nSources\nhttps://www.espn.com/nba/game/_/gameId/123456789\nhttps://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-09_03_30PM.pdf",
  };
  let allowed = true,
    age = true,
    mode = "ok",
    title = post.title,
    body = post.body;
  let gameReads = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.hostname === "a.espncdn.com")
      return new Response(null, { status: 404 });
    const headers = new Headers(
      input instanceof Request ? input.headers : init?.headers,
    );
    assert.equal(headers.get("authorization"), "Bearer synthetic");
    if (url.pathname === "/auth/v1/user")
      return Response.json({
        id: "reader",
        email_confirmed_at: "2026-01-01T00:00:00Z",
      });
    if (url.pathname.endsWith("/membership_status"))
      return Response.json({ allowed });
    if (url.pathname.endsWith("/age_verification_status"))
      return Response.json({ required: true, verified: age });
    if (url.pathname.endsWith("/community_posts"))
      return Response.json(mode === "hidden" ? [] : [{ ...post, title, body }]);
    if (url.pathname.endsWith("/nba_games")) {
      gameReads++;
      if (url.searchParams.get("select") === "slug") {
        assert.equal(url.searchParams.get("provider_id"), "eq.123456789");
        if (body.includes("vegasquant.app"))
          assert.equal(url.searchParams.get("slug"), "eq.ny-cle-20261109");
        return Response.json(
          mode === "unresolved" ? [] : [{ slug: game.slug }],
        );
      }
      if (url.searchParams.has("status")) return Response.json([]);
      assert.equal(url.searchParams.get("slug"), "eq.ny-cle-20261109");
      return Response.json([game]);
    }
    if (url.pathname.endsWith("/nba_observations")) return Response.json([]);
    throw Error(`Unexpected request ${url.pathname}`);
  };
  try {
    const { GET } = await import("../src/app/api/nba/matchup-sheet/[id]/route");
    const get = (postId = id, auth = true) =>
      GET(
        new Request("https://example.test/sheet", {
          headers: auth ? { authorization: "Bearer synthetic" } : {},
        }),
        { params: Promise.resolve({ id: postId }) },
      );
    assert.equal((await get(id, false)).status, 401);
    allowed = false;
    assert.equal((await get()).status, 403);
    allowed = true;
    age = false;
    assert.equal((await get()).status, 403);
    assert.equal(gameReads, 0, "denied viewers do not read chart data");
    age = true;
    const response = await get();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const sheet = await response.json();
    assert.match(sheet.svg, /NBA MATCHUP CHEAT SHEET/);
    assert.match(sheet.svg, /Synthetic report wording/);
    assert.equal(sheet.sources[0].href, "/nba/games/ny-cle-20261109");
    body += "\nhttps://vegasquant.app/nba/games/ny-cle-20261109";
    assert.equal(
      (await get()).status,
      200,
      "canonical-linked publications continue to render",
    );
    assert.equal(
      (await get("00000000-0000-4000-8000-000000000099")).status,
      404,
      "arbitrary post IDs remain rejected",
    );
    title += " extra";
    assert.equal((await get()).status, 404, "wrong title remains rejected");
    title = post.title;
    body = post.body;
    for (mode of ["hidden", "unresolved"])
      assert.equal((await get()).status, 404);
  } finally {
    globalThis.fetch = original;
  }
});
