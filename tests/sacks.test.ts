import test from "node:test";
import assert from "node:assert/strict";
import {
  contractFor,
  compare,
  espnStat,
  weeklyStat,
  statNumber,
  type Contract,
  type Game,
} from "../supabase/functions/result-sync/grade";
import { legHistory } from "../supabase/functions/result-sync/history";
import {
  marketKeys,
  marketPrice,
} from "../supabase/functions/result-sync/prices";
const game: Game = {
  id: "g",
  provider_id: "123",
  home_team: "Denver Broncos",
  away_team: "Seattle Seahawks",
  home_abbreviation: "DEN",
  away_abbreviation: "SEA",
  kickoff: "2026-10-16T00:15:00Z",
  season: 2026,
  week: 6,
};
const c = {
  name: "Test Defender",
  game_id: "g",
  team: game.home_team,
  book: "FanDuel",
  market: "Full game · Over 0.5 sacks",
  sack_market_type: "numeric_total",
  sack_settlement_review: {
    source_url: "https://example.test/exact-market-rules",
    observed_at: "2026-10-15T22:00:00Z",
  },
};
const parse = (x = c) =>
  contractFor(x, "k", [game], "2026-10-15T23:00:00Z", game.kickoff);
const contract = parse() as Contract;
test("numeric sacks need explicit settlement review; record-a-sack Yes/No cannot masquerade as a numeric total", () => {
  assert.equal(contract.metric, "def_sacks");
  assert.equal(contract.operator, "over");
  assert.equal(typeof parse({ ...c, sack_market_type: "yes_no" }), "string");
  assert.equal(
    typeof parse({
      ...c,
      sack_settlement_review: {
        ...c.sack_settlement_review,
        observed_at: "2026-10-16T22:00:00Z",
      },
    }),
    "string",
  );
  assert.equal(
    typeof parse({ ...c, market: "Full game · To record a sack" }),
    "string",
  );
  assert.equal(
    typeof parse({ ...c, market: "Full game · Over 0.25 sacks" }),
    "string",
  );
});
test("half sacks preserve numerical totals, pushes and threshold semantics", () => {
  for (const raw of ["0", "0.5", "1.0", "1.5", "2.50"])
    assert.equal(statNumber(raw, "def_sacks"), Number(raw));
  for (const raw of ["", "--", "-0.5", "0.25", "NaN", "1 sack"])
    assert.equal(statNumber(raw, "def_sacks"), null);
  assert.equal(statNumber("0.5", "passing_yards"), null);
  assert.equal(compare(0.5, contract), "PUSH");
  assert.equal(compare(1, contract), "WIN");
  assert.equal(compare(0, contract), "LOSS");
  const milestone = parse({
    ...c,
    market: "Full game · 0.5+ sacks",
  }) as Contract;
  assert.equal(compare(0.5, milestone), "WIN");
});
const summary = (value: string) => ({
  header: {
    id: "123",
    season: { year: 2026, type: 2 },
    competitions: [
      {
        date: game.kickoff,
        status: { type: { completed: true, state: "post" } },
        competitors: [
          { homeAway: "home", team: { displayName: game.home_team } },
          { homeAway: "away", team: { displayName: game.away_team } },
        ],
      },
    ],
  },
  boxscore: {
    players: [
      {
        team: { displayName: game.home_team },
        statistics: [
          {
            name: "defensive",
            keys: ["totalTackles", "sacks", "QBHits"],
            athletes: [
              {
                athlete: { id: "d1", displayName: "Test Defender" },
                stats: ["3", value, "4"],
              },
            ],
          },
        ],
      },
    ],
  },
});
test("defensive sacks read the defensive field, never QB sacks suffered or pressure hits", () => {
  const s = espnStat(summary("0.5"), game, contract);
  assert.ok(typeof s !== "string");
  assert.equal(s.value, 0.5);
  assert.equal(s.final, true);
  assert.equal(typeof espnStat(summary("--"), game, contract), "string");
  const absent = summary("0.5");
  absent.boxscore.players[0].statistics[0].athletes = [];
  assert.equal(typeof espnStat(absent, game, contract), "string");
});
const row = (week: number, value: string) => ({
  player_id: "d1",
  player_display_name: "Test Defender",
  season: "2026",
  season_type: "REG",
  week: String(week),
  game_id: `2026_${String(week).padStart(2, "0")}_SEA_DEN`,
  team: "DEN",
  opponent_team: "SEA",
  position: "DE",
  def_sacks: value,
});
test("nflverse defensive sack corroboration/history preserve halves and exclude target-week outcomes", () => {
  const r = weeklyStat([row(6, "1.5")], game, contract);
  assert.ok(typeof r !== "string");
  assert.equal(r.value, 1.5);
  assert.equal(typeof weeklyStat([row(6, "")], game, contract), "string");
  assert.equal(typeof weeklyStat([row(6, ".25")], game, contract), "string");
  const h = legHistory(
    [
      row(1, "0"),
      row(2, "0.5"),
      row(3, "1"),
      row(4, "1.5"),
      row(5, "0.5"),
      row(6, "9"),
    ],
    contract,
    game,
  );
  assert.ok(typeof h !== "string");
  assert.equal(h.sample, 5);
  assert.equal(h.cleared, 2);
  assert.equal(h.median, 0.5);
});
test("sacks price matching uses the exact numeric threshold and player", () => {
  assert.deepEqual(marketKeys("def_sacks"), [
    "player_sacks",
    "player_sacks_alternate",
  ]);
  const price = marketPrice(
    contract,
    [
      {
        game_id: "g",
        observed_at: "2026-10-15T23:00:00Z",
        payload: {
          book: "FanDuel",
          market: "player_sacks",
          outcomes: [
            {
              description: "Test Defender",
              name: "Over",
              point: 0.5,
              price: -160,
            },
          ],
        },
      },
    ],
    Date.parse(game.kickoff),
  );
  assert.equal(price?.point, 0.5);
  assert.equal(price?.price, -160);
});
