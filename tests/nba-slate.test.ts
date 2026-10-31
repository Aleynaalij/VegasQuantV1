import test from "node:test";
import assert from "node:assert/strict";
import {
  gameLines,
  latestQuotes,
  nbaFaces,
  nbaSlateGame,
  playerLines,
  selectionLabel,
  type NbaQuoteRow,
} from "../src/lib/nba-slate";

const game = nbaSlateGame({
  id: "g1",
  away_team: "Portland Trail Blazers",
  home_team: "Utah Jazz",
  away_abbreviation: "POR",
  home_abbreviation: "UTAH",
  tipoff: "2026-10-31T19:10:00Z",
  tipoff_tbd: false,
  venue: "Delta Center",
  status: "STATUS_SCHEDULED",
});
const row = (
  market: string,
  outcomes: unknown[],
  recorded_at = "2026-10-31T10:00:00Z",
  book = "FanDuel",
): NbaQuoteRow => ({
  game_id: "g1",
  kind: market.startsWith("player") ? "prop" : "odds",
  recorded_at,
  payload: {
    book,
    market,
    outcomes: outcomes as never,
    provider_updated_at: "2026-10-31T10:00:06Z",
  },
});

test("NBA games map to the shared slate shape with two-word nicknames kept", () => {
  assert.equal(game.away.short, "Trail Blazers");
  assert.equal(game.home.short, "Jazz");
  assert.equal(game.sport, "nba");
});

test("only the newest FanDuel quote per market is used", () => {
  const rows = [
    row(
      "h2h",
      [
        { name: "Utah Jazz", price: 150 },
        { name: "Portland Trail Blazers", price: -170 },
      ],
      "2026-10-31T10:00:00Z",
    ),
    row(
      "h2h",
      [
        { name: "Utah Jazz", price: 200 },
        { name: "Portland Trail Blazers", price: -240 },
      ],
      "2026-10-31T09:00:00Z",
    ),
    row(
      "h2h",
      [
        { name: "Utah Jazz", price: 999 },
        { name: "Portland Trail Blazers", price: -999 },
      ],
      "2026-10-31T11:00:00Z",
      "DraftKings",
    ),
  ];
  assert.equal(latestQuotes(rows).g1.h2h.recorded_at, "2026-10-31T10:00:00Z");
  const face = nbaFaces(rows, [game]).g1;
  assert.equal(face.home.price, 150);
  assert.equal(face.away.price, -170);
});

test("spread and total keep the quoted points and prices", () => {
  const latest = latestQuotes([
    row("spreads", [
      { name: "Portland Trail Blazers", point: -6.5, price: -108 },
      { name: "Utah Jazz", point: 6.5, price: -112 },
    ]),
    row("totals", [
      { name: "Over", point: 231.5, price: -110 },
      { name: "Under", point: 231.5, price: -110 },
    ]),
  ]);
  const lines = gameLines(latest.g1, game);
  assert.deepEqual(lines.spread, [
    { label: "Trail Blazers", point: -6.5, price: -108 },
    { label: "Jazz", point: 6.5, price: -112 },
  ]);
  assert.equal(lines.total[0].point, 231.5);
  assert.equal(lines.quotedAt, "2026-10-31T10:00:06Z");
});

test("player props pair Over and Under at the same line and never invent a side", () => {
  const latest = latestQuotes([
    row("player_points", [
      { name: "Over", point: 23.5, price: -102, description: "Kevin Durant" },
      { name: "Under", point: 23.5, price: -130, description: "Kevin Durant" },
      {
        name: "Over",
        point: 9.5,
        price: -125,
        description: "Isaiah Hartenstein",
      },
    ]),
  ]);
  assert.deepEqual(playerLines(latest.g1), [
    {
      player: "Kevin Durant",
      stat: "PTS",
      point: 23.5,
      over: -102,
      under: -130,
    },
    {
      player: "Isaiah Hartenstein",
      stat: "PTS",
      point: 9.5,
      over: -125,
      under: null,
    },
  ]);
});

test("selection labels read like the slip", () => {
  assert.equal(
    selectionLabel({ market: "player_points", direction: "Over", line: 17.5 }),
    "Over 17.5 PTS",
  );
  assert.equal(
    selectionLabel({
      market: "player_rebounds",
      direction: "Under",
      line: 8.5,
    }),
    "Under 8.5 REB",
  );
});

test("a revised selection replaces the one it supersedes", async () => {
  const { currentSelections } = await import("../src/lib/nba-slate");
  const rows = [
    { id: "v2", supersedes_id: "v1", direction: "Under" },
    { id: "v1", supersedes_id: null, direction: "Over" },
    { id: "other", supersedes_id: null, direction: "Over" },
  ];
  assert.deepEqual(
    currentSelections(rows).map((r) => r.id),
    ["v2", "other"],
  );
});

test("TBD tip-offs keep their flag and stay listed through the placeholder day", async () => {
  const { upcomingSlate } = await import("../src/lib/sport-slate");
  const tbd = nbaSlateGame({
    id: "t",
    away_team: "Boston Celtics",
    home_team: "New York Knicks",
    away_abbreviation: "BOS",
    home_abbreviation: "NY",
    tipoff: "2026-10-31T04:00:00Z",
    tipoff_tbd: true,
    venue: null,
    status: "STATUS_SCHEDULED",
  });
  assert.equal(tbd.tbd, true);
  const now = Date.parse("2026-10-31T15:00:00Z");
  assert.deepEqual(
    upcomingSlate([tbd], now).map((g) => g.id),
    ["t"],
  );
  assert.deepEqual(upcomingSlate([{ ...tbd, tbd: false }], now), []);
  assert.deepEqual(
    upcomingSlate([tbd], Date.parse("2026-11-01T05:00:00Z")),
    [],
  );
});
