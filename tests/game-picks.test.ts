import test from "node:test";
import assert from "node:assert/strict";
import {
  footballPickGames,
  gamePicksPath,
  readGamePublications,
} from "../src/lib/game-picks";
import type { Game } from "../src/lib/domain";

const game = (id: string, kickoff: string, sport?: "nfl" | "nba") =>
  ({ id, slug: id, kickoff, sport }) as Game;

test("Home keeps tonight's football link through kickoff and Eastern midnight", () => {
  const games = [
    game("tonight", "2026-10-23T00:15:00Z"),
    game("later", "2026-10-25T17:00:00Z"),
  ];
  assert.deepEqual(
    footballPickGames(games, new Date("2026-10-23T02:00:00Z")).map((g) => g.id),
    ["tonight"],
  );
  assert.deepEqual(
    footballPickGames(games, new Date("2026-10-23T04:01:00Z")).map((g) => g.id),
    ["later"],
  );
});

test("football links exclude NBA and invalid dates, include every game in the next day's slate", () => {
  const games = [
    game("late", "2026-11-08T21:25:00Z", "nfl"),
    game("nba", "2026-11-07T23:00:00Z", "nba"),
    game("bad", "invalid"),
    game("early", "2026-11-08T18:00:00Z"),
  ];
  assert.deepEqual(
    footballPickGames(games, new Date("2026-11-07T20:00:00Z")).map((g) => g.id),
    ["early", "late"],
  );
  assert.deepEqual(footballPickGames([], new Date("2026-11-07T20:00:00Z")), []);
  assert.equal(
    gamePicksPath("ne-chi-2026-2-7"),
    "/matchups/ne-chi-2026-2-7/picks",
  );
});

test("game publications include older rows beyond the database's first page", async () => {
  const source = Array.from({ length: 1003 }, (_, i) => ({
    leg_key: `leg-${i}`,
  }));
  const calls: number[][] = [];
  const rows = await readGamePublications(async (from, to) => {
    calls.push([from, to]);
    return { data: source.slice(from, to + 1), error: null };
  });
  assert.equal(rows.length, 1003);
  assert.equal(rows.at(-1)?.leg_key, "leg-1002");
  assert.deepEqual(calls, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});

test("failed later pages do not silently present a partial list as every pick", async () => {
  await assert.rejects(
    readGamePublications(
      async (from) =>
        from === 0
          ? { data: [{ leg_key: "one" }, { leg_key: "two" }], error: null }
          : { data: null, error: new Error("unavailable") },
      2,
    ),
    /could not load/,
  );
});
