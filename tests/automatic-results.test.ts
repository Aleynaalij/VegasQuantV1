import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contractFor,
  compare,
  espnStat,
  csvRows,
  weeklyStat,
  type Game,
  type Contract,
} from "../supabase/functions/result-sync/grade";
const game: Game = {
  id: "g",
  provider_id: "123",
  home_team: "Los Angeles Rams",
  away_team: "Buffalo Bills",
  home_abbreviation: "LAR",
  away_abbreviation: "BUF",
  kickoff: "2026-10-13T00:15:00Z",
  season: 2026,
  week: 5,
};
const candidate = {
  name: "James Cook",
  team: "Buffalo Bills",
  market: "Full game · 70+ rushing yards",
};
const contract = contractFor(
  candidate,
  "candidate:r:1",
  [game],
  "2026-10-13T01:44:00Z",
  "2026-10-13T04:00:00Z",
) as Contract;
test("exact full game target binding rejects ambiguity and partial periods", () => {
  assert.equal(contract.threshold, 70);
  assert.equal(contract.game_id, "g");
  assert.equal(
    typeof contractFor(
      candidate,
      "k",
      [game, { ...game, id: "duplicate" }],
      "2026-10-13T01:44:00Z",
      "2026-10-13T04:00:00Z",
    ),
    "string",
  );
  for (const market of [
    "Second half · 70+ rushing yards",
    "1st quarter · 70+ rushing yards",
    "70+ rushing yards",
    "Full game · anytime touchdown",
  ]) {
    assert.equal(
      typeof contractFor(
        { ...candidate, market },
        "k",
        [game],
        "2026-10-13T01:44:00Z",
        "2026-10-13T04:00:00Z",
      ),
      "string",
    );
  }
  assert.equal(
    typeof contractFor(
      { ...candidate, game_id: "wrong" },
      "k",
      [game],
      "2026-10-13T01:44:00Z",
      "2026-10-13T04:00:00Z",
    ),
    "string",
  );
});
test("threshold semantics include ties, unders and stat deductions", () => {
  assert.equal(compare(70, contract), "WIN");
  assert.equal(compare(69, contract), "LOSS");
  assert.equal(compare(70, { threshold: 70, operator: "over" }), "PUSH");
  assert.equal(compare(-1, { threshold: 0, operator: "over" }), "LOSS");
  assert.equal(compare(69, { threshold: 70, operator: "under" }), "WIN");
});
const summary = {
  header: {
    id: "123",
    season: { year: 2026, type: 2 },
    competitions: [
      {
        date: game.kickoff,
        status: { type: { state: "in", completed: false } },
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
        team: { displayName: game.away_team },
        statistics: [
          {
            name: "rushing",
            keys: ["rushingAttempts", "rushingYards"],
            athletes: [
              {
                athlete: { id: "4", displayName: "James Cook" },
                stats: ["12", "70"],
              },
            ],
          },
        ],
      },
    ],
  },
};
test("live clearing is not final and missing players never become zero", () => {
  const s = espnStat(summary, game, contract);
  assert.equal(typeof s, "object");
  if (typeof s !== "string") {
    assert.equal(s.final, false);
    assert.equal(s.value, 70);
  }
  assert.equal(
    typeof espnStat(summary, game, { ...contract, player: "Missing Player" }),
    "string",
  );
  assert.equal(
    typeof espnStat(summary, { ...game, provider_id: "different" }, contract),
    "string",
  );
  const final = structuredClone(summary);
  final.header.competitions[0].status.type = { state: "post", completed: true };
  assert.equal((espnStat(final, game, contract) as any).final, true);
});
test("weekly confirmation is specific to season, week, team and opponent", () => {
  const text =
    'player_display_name,player_id,season,week,season_type,team,opponent_team,game_id,rushing_yards,receiving_yards,passing_yards,receptions\n"James Cook",p,2026,5,REG,BUF,LA,2026_05_BUF_LA,111,7,0,1\n';
  const rows = csvRows(text);
  assert.equal((weeklyStat(rows, game, contract) as any).value, 111);
  assert.equal(
    typeof weeklyStat(rows, { ...game, week: 6 }, contract),
    "string",
  );
  assert.equal(typeof weeklyStat([...rows, ...rows], game, contract), "string");
  assert.throws(() => csvRows("wrong,header\n1,2"));
});

test("standard name suffix resolves only a single player on the exact team", () => {
  const s = structuredClone(summary);
  s.boxscore.players[0].statistics[0].athletes[0].athlete.displayName =
    "James Cook III";
  assert.equal((espnStat(s, game, contract) as any).value, 70);
  s.boxscore.players[0].statistics[0].athletes.push(
    s.boxscore.players[0].statistics[0].athletes[0],
  );
  assert.equal(typeof espnStat(s, game, contract), "string");
});
