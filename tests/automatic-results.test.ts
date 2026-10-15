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
    "10+ first-quarter rushing yards",
    "Full game · anytime touchdown",
    "FULL GAME TOTAL · 70+ total rushing yards · WATCHLIST · PRICE TOO EXPENSIVE",
    "Rushing yards · unpriced watch",
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

const at = (c: any, games: Game[] = [game]) =>
  contractFor(c, "k", games, "2026-10-13T01:44:00Z", "2026-10-13T04:00:00Z");
test("desk market wordings parse to the same full-game contract", () => {
  for (const [market, threshold, operator] of [
    ["FULL GAME TOTAL · 70+ rushing yards", 70, "gte"],
    ["FULL GAME TOTAL · 70+ total rushing yards · LEAN", 70, "gte"],
    ["FULL GAME TOTAL · Under 43.5 total rushing yards · CONDITIONAL LEAN", 43.5, "under"],
    ["Over 86.5 rushing yards", 86.5, "over"],
    ["70+ rushing yards", 70, "gte"],
  ] as const) {
    const c = at({ ...candidate, market }) as Contract;
    assert.equal(typeof c, "object", market);
    assert.deepEqual([c.threshold, c.operator, c.metric], [threshold, operator, "rushing_yards"]);
  }
  // A bare market is only full game when nothing points at a quarter or half.
  assert.equal(
    typeof at({ ...candidate, market: "70+ rushing yards", matchup: "BUF @ LAR · First quarter" }),
    "string",
  );
  assert.equal(
    typeof at({ ...candidate, market: "FULL GAME TOTAL · 70+ rushing yards", matchup: "Buffalo @ Los Angeles Rams · Halftime BUF 14–LAR 7" }),
    "object",
  );
  assert.equal(
    typeof at({ ...candidate, market: "70+ rushing yards", matchup: "Buffalo @ Los Angeles Rams · Halftime BUF 14–LAR 7" }),
    "string",
  );
});
test("selections without a team bind by matchup and resolve the side from the box score", () => {
  const { team: _, ...noTeam } = candidate;
  const other = { ...game, id: "other", provider_id: "999", home_team: "Buffalo Bills", away_team: "Miami Dolphins", home_abbreviation: "BUF", away_abbreviation: "MIA" };
  for (const matchup of ["BUF @ LAR · Oct 12", "Buffalo @ Los Angeles Rams · Oct 12", "Buffalo Bills @ Los Angeles Rams"])
    assert.equal((at({ ...noTeam, matchup }, [game, other]) as Contract).game_id, "g", matchup);
  assert.equal(typeof at({ ...noTeam, matchup: "Rams @ Bills" }, [game, other]), "string");
  assert.equal(typeof at(noTeam, [game]), "string");
  const c = at({ ...noTeam, matchup: "BUF @ LAR" }) as Contract;
  assert.equal(c.team, "");
  const s = espnStat(summary, game, c) as any;
  assert.deepEqual([s.value, s.team], [70, "Buffalo Bills"]);
  // The same name on both teams is ambiguous.
  const both = structuredClone(summary);
  both.boxscore.players.push({ ...structuredClone(both.boxscore.players[0]), team: { displayName: game.home_team } });
  assert.equal(typeof espnStat(both, game, c), "string");
});
test("an explicit game id stays gradable after a slate release expires", () => {
  const later = { ...game, kickoff: "2026-10-13T20:00:00Z" };
  assert.equal(typeof at({ ...candidate, game_id: "g" }, [later]), "object");
  assert.equal(typeof at(candidate, [later]), "string");
  assert.equal(typeof at({ ...candidate, parlay: true }), "string");
});
test("team abbreviations bind and store the full team name", () => {
  const c = at({ ...candidate, team: "BUF", matchup: "BUF @ LAR · Oct 12" }) as Contract;
  assert.equal(c.team, "Buffalo Bills");
  assert.equal(typeof at({ ...candidate, team: "NYJ" }), "string");
});
