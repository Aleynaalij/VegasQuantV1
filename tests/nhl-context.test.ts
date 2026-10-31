import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  gameLine,
  goalieForm,
  recentGames,
  resolveGoalie,
  rotowireLineup,
  skaterForm,
  targetGame,
  teamForm,
} from "../supabase/functions/nhl-context/normalize";
import { nhlWatchlist } from "../src/lib/nhl-context";
const source = {
  url: "https://www.rotowire.com/hockey/nhl-lineups.php?date=2026-10-31",
  sha256: "a".repeat(64),
  retrieved_at: "2026-10-31T15:00:00Z",
};
const game = (id: number, date: string, extra = {}) => ({
  id,
  season: 20262027,
  gameType: 2,
  gameDate: date,
  startTimeUTC: date + "T23:00:00Z",
  gameState: "FINAL",
  gameScheduleState: "OK",
  awayTeam: { abbrev: "PIT", score: 3 },
  homeTeam: { abbrev: "MTL", score: 2 },
  gameOutcome: { lastPeriodType: "REG" },
  ...extra,
});
test("NHL last-five selection binds exact season, teams and pregame cutoff; SO deciding goals excluded", () => {
  const rows = Array.from({ length: 7 }, (_, i) =>
    game(2026020000 + i, `2026-10-${20 + i}`),
  );
  const schedule = {
    games: [
      ...rows,
      game(2026020010, "2026-10-30", { gameType: 1 }),
      game(2026020020, "2026-10-31", { gameState: "FUT" }),
    ],
  };
  assert.equal(
    recentGames(schedule, "PIT", "2026-10-31T23:00:00Z", 20262027).length,
    5,
  );
  assert.equal(
    recentGames(schedule, "PIT", "2026-10-25T23:00:00Z", 20262027)[0].gameDate,
    "2026-10-24",
  );
  assert.equal(
    targetGame(
      { games: [game(1, "2026-10-31")] },
      "PIT",
      "MTL",
      "2026-10-31T23:00:00Z",
      20262027,
    ).id,
    1,
  );
  assert.throws(() =>
    targetGame(schedule, "MTL", "PIT", "2026-10-31T23:00:00Z", 20262027),
  );
  const so = game(1, "2026-10-20", { gameOutcome: { lastPeriodType: "SO" } });
  assert.deepEqual(
    [
      gameLine(so, "PIT").goalsFor,
      gameLine(so, "MTL").goalsAgainst,
      gameLine(so, "MTL").result,
    ],
    [2, 2, "OTL"],
  );
  assert.equal(teamForm([], "PIT").goalsForPerGame, null);
  assert.throws(() =>
    gameLine(game(1, "2026-10-20", { homeTeam: { abbrev: "MTL" } }), "PIT"),
  );
});
test("NHL skater leaders require every chosen box score, explicit stats and reconciled goals", () => {
  const g = game(1, "2026-10-20"),
    stat = {
      playerId: 10,
      name: { default: "S. One" },
      goals: 3,
      assists: 1,
      points: 4,
    };
  const b = {
    ...g,
    playerByGameStats: { awayTeam: { forwards: [stat], defense: [] } },
  };
  const r = skaterForm(
    [g],
    new Map([[1, b]]),
    "PIT",
    [{ id: 10, name: "Skater One" }],
    20262027,
  );
  assert.equal(r.skaters?.[0].goals, 3);
  assert.equal(r.skaters?.[0].name, "Skater One");
  assert.equal(
    skaterForm(
      [g, game(2, "2026-10-21")],
      new Map([[1, b]]),
      "PIT",
      [],
      20262027,
    ).skaters,
    null,
  );
  const broken = structuredClone(b);
  delete (broken.playerByGameStats.awayTeam.forwards[0] as any).points;
  assert.equal(
    skaterForm([g], new Map([[1, broken]]), "PIT", [], 20262027).skaters,
    null,
  );
  const conflict = structuredClone(b);
  conflict.homeTeam.score = 4;
  assert.equal(
    skaterForm([g], new Map([[1, conflict]]), "PIT", [], 20262027).skaters,
    null,
  );
});
test("Goalie GAA weights real time, accepts actual shutouts, excludes DNP/current day and refuses missing values", () => {
  const log = {
    gameLog: [
      { gameId: 1, gameDate: "2026-10-30", toi: "30:00", goalsAgainst: 1 },
      { gameId: 2, gameDate: "2026-10-29", toi: "60:00", goalsAgainst: 2 },
      { gameId: 3, gameDate: "2026-10-28", toi: "00:00", goalsAgainst: 0 },
      { gameId: 4, gameDate: "2026-10-31", toi: "60:00", goalsAgainst: 9 },
    ],
  };
  assert.equal(goalieForm(log, "2026-10-31").gaa, 2);
  assert.equal(goalieForm(log, "2026-10-31").sample, 2);
  assert.equal(
    goalieForm(
      {
        gameLog: [
          { gameId: 1, gameDate: "2026-10-30", toi: "60:00", goalsAgainst: 0 },
        ],
      },
      "2026-10-31",
    ).gaa,
    0,
  );
  const broken = structuredClone(log);
  delete (broken.gameLog[0] as any).goalsAgainst;
  assert.equal(goalieForm(broken, "2026-10-31").gaa, null);
  assert.equal(
    resolveGoalie(
      [{ id: 1, name: "Keeper One", goalie: true }],
      "Other Keeper",
    ),
    null,
  );
});
test("Rotowire parsing binds date/pair, separates goalie confirmation from projected PP1 and ignores PP2", () => {
  const list = (side: string, confirmed: boolean) =>
    `<ul class="lineup__list is-${side}"><li class="lineup__player-highlight"><a>Keeper ${side}</a><div class="${confirmed ? "is-confirmed" : "is-unconfirmed"}">${confirmed ? "Confirmed" : "Expected"}</div></li><li class="lineup__title">POWER PLAY #1</li>${Array.from({ length: 5 }, (_, i) => `<li class="lineup__player"><div class="lineup__pos">C</div><a title="Skater ${side} ${i}">S.${i}</a></li>`).join("")}<li class="lineup__title is-middle">POWER PLAY #2</li><li class="lineup__player"><div class="lineup__pos">C</div><a>Not PP1</a></li></ul>`;
  const html = `Starting NHL lineups for October 31, 2026<div class="lineup is-nhl"><div class="lineup__abbr">PIT</div><div class="lineup__abbr">MTL</div>${list("visit", true)}${list("home", false)}</div>`;
  const parsed = rotowireLineup(html, "2026-10-31", "PIT", "MTL", source)!;
  assert.equal(parsed[0]?.goalie?.status, "confirmed");
  assert.equal(parsed[1]?.goalie?.status, "expected");
  assert.equal(parsed[0]?.powerPlay?.players.length, 5);
  assert.equal(parsed[0]?.powerPlay?.status, "projected");
  assert.equal(rotowireLineup(html, "2026-11-01", "PIT", "MTL", source), null);
  assert.equal(rotowireLineup(html, "2026-10-31", "MTL", "PIT", source), null);
});
test("Private favorite matching resolves unique identities but refuses surname ambiguity", () => {
  const roster = [
    { id: 1, name: "Alex Exampleton" },
    { id: 2, name: "Jack Hughes" },
    { id: 3, name: "Luke Hughes" },
  ];
  assert.deepEqual(
    nhlWatchlist("Exampletn, Jack Hughes, Hughes", roster).map((p) => p.id),
    [1, 2],
  );
  assert.deepEqual(nhlWatchlist("Invented Player", roster), []);
});
test("NHL context SQL restricts sources/work/writes and isolates member favorites", () => {
  const r = spawnSync(process.execPath, ["tests/sql/nhl-context.mjs"], {
    encoding: "utf8",
    timeout: 60000,
  });
  assert.equal(r.status, 0, r.error?.message || r.stderr || r.stdout);
});
