import test from "node:test";
import assert from "node:assert/strict";
import {
  isLiveSport,
  liveStrip,
  parseScoreboard,
  sameGame,
  scoreboardDays,
  type LiveGame,
} from "../src/lib/live-scores";

const NOW = Date.parse("2026-11-01T01:00:00Z");
const event = (
  id: string,
  state: string,
  start: string,
  detail: string,
  scores = ["3", "2"],
) => ({
  id,
  date: start,
  status: { type: { state, shortDetail: detail } },
  competitions: [
    {
      date: start,
      competitors: [
        {
          homeAway: "away",
          score: scores[0],
          team: { displayName: "Boston Bruins", abbreviation: "BOS" },
        },
        {
          homeAway: "home",
          score: scores[1],
          team: { displayName: "Toronto Maple Leafs", abbreviation: "TOR" },
        },
      ],
    },
  ],
});

test("parses scores, status and teams; pre-game scores are blank, malformed events dropped", () => {
  const games = parseScoreboard({
    events: [
      event("1", "in", "2026-11-01T00:00:00Z", "2nd 10:41"),
      event("2", "pre", "2026-11-01T02:00:00Z", "10:00 PM EDT", ["0", "0"]),
      event("3", "post", "2026-10-31T23:00:00Z", "Final/OT", ["4", "5"]),
      { ...event("4", "in", "2026-11-01T00:00:00Z", "x"), id: "abc" },
      { ...event("5", "weird", "2026-11-01T00:00:00Z", "x") },
      {
        id: "6",
        status: { type: { state: "in" } },
        competitions: [{ competitors: [] }],
      },
    ],
  });
  assert.deepEqual(
    games.map((g) => g.id),
    ["1", "2", "3"],
  );
  assert.equal(games[0].away.score, 3);
  assert.equal(games[0].detail, "2nd 10:41");
  assert.equal(games[1].home.score, null);
  assert.equal(games[2].state, "post");
});

test("strip: live first by start, recent finals newest first, priority games kept first, capped", () => {
  const g = (
    id: string,
    state: LiveGame["state"],
    hoursAgo: number,
  ): LiveGame => ({
    id,
    state,
    start: new Date(NOW - hoursAgo * 3600000).toISOString(),
    detail: "",
    away: { name: "A" + id, abbreviation: "A", score: 1 },
    home: { name: "H" + id, abbreviation: "H", score: 0 },
  });
  const games = [
    g("a", "in", 1),
    g("b", "in", 2),
    g("c", "post", 4),
    g("d", "post", 30),
    g("e", "pre", -1),
    g("b", "in", 2),
  ];
  const s = liveStrip(games, NOW);
  assert.deepEqual(
    s.live.map((x) => x.id),
    ["b", "a"],
  );
  assert.deepEqual(
    s.finals.map((x) => x.id),
    ["c"],
    "finals older than the window drop off",
  );
  const capped = liveStrip(games, NOW, 1, (x) => x.id === "a");
  assert.deepEqual(
    capped.live.map((x) => x.id),
    ["a"],
    "a game we have a pick on wins the last slot",
  );
  assert.equal(capped.more, 1);
  assert.equal(capped.finals.length, 0);
});

test("matches our slate by exact team pair and nearby start only", () => {
  const live = parseScoreboard({
    events: [event("1", "in", "2026-11-01T00:00:00Z", "")],
  })[0];
  assert.ok(
    sameGame(live, {
      away: "Boston Bruins",
      home: "Toronto Maple Leafs",
      start: "2026-11-01T00:05:00Z",
    }),
  );
  assert.ok(
    !sameGame(live, {
      away: "Toronto Maple Leafs",
      home: "Boston Bruins",
      start: "2026-11-01T00:00:00Z",
    }),
  );
  assert.ok(
    !sameGame(live, {
      away: "Boston Bruins",
      home: "Toronto Maple Leafs",
      start: "2026-11-02T00:00:00Z",
    }),
  );
});

test("sport keys and the two ET scoreboard days around midnight", () => {
  assert.ok(isLiveSport("ncaab"));
  assert.ok(!isLiveSport("toString"));
  assert.deepEqual(scoreboardDays(Date.parse("2026-11-01T03:30:00Z")), [
    "20261030",
    "20261031",
  ]);
});

test("NHL and college links reuse the collector's slug", async () => {
  const { sportGameHref } = await import("../src/lib/live-scores");
  const g = parseScoreboard({
    events: [event("401", "in", "2026-11-01T00:00:00Z", "")],
  })[0];
  assert.equal(sportGameHref("nhl", g), "/nhl/games/bos-tor-401");
});
