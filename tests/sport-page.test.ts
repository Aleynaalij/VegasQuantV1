import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  gameMarkets,
  isStale,
  latestMarkets,
  marketLine,
  slateGame,
  sportFace,
} from "../src/lib/sport-page";
import type { SportMarket, SportPage } from "../src/lib/sport-contract";

const nhl: SportPage = JSON.parse(
  fs.readFileSync("tests/fixtures/sports/nhl/page.json", "utf8"),
);
const ncaab: SportPage = JSON.parse(
  fs.readFileSync("tests/fixtures/sports/ncaab/page.json", "utf8"),
);
const base = nhl.markets[0];
const m = (over: Partial<SportMarket>): SportMarket => ({
  ...base,
  expires_at: "2026-11-02T23:00:00Z",
  ...over,
});
const now = Date.parse("2026-11-01T12:00:00Z");

test("contract games map to the slate shape with game links per sport", () => {
  const g = slateGame(nhl.games[0]);
  assert.equal(g.sport, "nhl");
  assert.equal(g.href, "/nhl/games/sample-a-sample-b");
  assert.equal(g.neutral, false);
  const c = slateGame({ ...ncaab.games[0], neutral_site: true });
  assert.equal(c.neutral, true);
  assert.equal(
    slateGame({ ...nhl.games[0], completed: true }).status,
    "STATUS_FINAL",
  );
});

test("the newest quote per exact selection stays; an expired one is kept but marked stale", () => {
  const rows = latestMarkets([
    m({ id: "old", odds: -120, observed_at: "2026-11-01T10:00:00Z" }),
    m({ id: "new", odds: -105, observed_at: "2026-11-01T11:00:00Z" }),
    m({
      id: "aged",
      side: "home",
      selection: "Sample b",
      observed_at: "2026-11-01T11:29:00Z",
      expires_at: "2026-11-01T11:59:00Z",
    }),
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["aged", "new"],
  );
  assert.equal(isStale(rows[0], now), true);
  assert.equal(isStale(rows[1], now), false);
});

test("the moneyline face needs both quoted sides", () => {
  assert.equal(sportFace([m({ side: "away" })]), null);
  const face = sportFace([
    m({ side: "away", odds: -150 }),
    m({ id: "h", side: "home", selection: "Sample b", odds: 130 }),
  ]);
  assert.equal(face?.away.price, -150);
  assert.ok(face!.away.probability > 0.5);
});

test("each sport shows only its owner-scoped markets, exact lines, with settlement notes", () => {
  const page = {
    sport: "ncaab" as const,
    markets: [
      m({
        id: "s",
        sport: "ncaab",
        market: "spreads",
        selection: "Duke",
        side: "home",
        line: -3.5,
        settlement: "including_overtime",
        settlement_note: "Full game including overtime",
      }),
      m({
        id: "t",
        sport: "ncaab",
        market: "totals",
        selection: "Over",
        direction: "Over",
        line: 141.5,
      }),
    ],
  };
  const groups = gameMarkets(page, base.game_id);
  assert.deepEqual(
    groups.map((g) => g.market),
    ["spreads"],
  );
  assert.equal(marketLine(groups[0].rows[0]), "Duke -3.5");
  assert.deepEqual(groups[0].settlement, ["Full game including overtime"]);
  assert.equal(
    marketLine(
      m({
        market: "player_goal_scorer_anytime",
        direction: "Yes",
        player: "A Skater",
      }),
    ),
    "To score",
  );
  assert.equal(
    marketLine(
      m({
        market: "player_points",
        direction: "Over",
        line: 0.5,
        player: "A Skater",
      }),
    ),
    "Over 0.5",
  );
});

test("injuries come only from provider facts and keep the availability caveat", async () => {
  const { sportInjuries } = await import("../src/lib/sport-page");
  const fact = (payload: Record<string, unknown>) => ({
    id: "f",
    game_id: "g",
    kind: "team_context" as const,
    payload,
    source: nhl.games[0].source,
  });
  const out = sportInjuries(
    [
      fact({ team_id: "x", data: {} }),
      fact({
        injuries: [
          {
            team: { displayName: "Sample b" },
            injuries: [
              { athlete: { displayName: "A Skater" }, status: "Day-To-Day" },
              { athlete: {}, status: "Out" },
            ],
          },
        ],
        availability:
          "Provider-reported only; omissions do not confirm availability",
        goalie_confirmation: "Unknown unless explicitly reported in source",
      }),
    ],
    "g",
  );
  assert.deepEqual(out.lines, [
    { team: "Sample b", player: "A Skater", status: "Day-To-Day" },
  ]);
  assert.equal(out.notes.length, 2);
  assert.deepEqual(sportInjuries([], "g"), { lines: [], notes: [] });
});
