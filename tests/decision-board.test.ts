import { test } from "node:test";
import assert from "node:assert/strict";
import {
  easternDay,
  gameWindow,
  windowDecision,
  type BoardTarget,
} from "../src/lib/decision-board";
const game = {
  id: "g",
  slug: "g",
  away_team: "A",
  home_team: "B",
  kickoff: "2026-10-04T20:25:00Z",
};
const target: BoardTarget = {
  id: "t",
  game_id: "g",
  selection: "Watch",
  status: "WATCH",
  updated_at: "2026-10-04T15:00:00Z",
  current_number: null,
  current_odds: null,
  what_we_are_waiting_for: "Price",
  playable_number: null,
  why_we_like_it: "Research",
  rank: 1,
};
test("Eastern game dates do not follow UTC midnight", () =>
  assert.equal(easternDay(Date.parse("2026-10-06T00:15:00Z")), "2026-10-05"));
test("windows use Eastern kickoff time including daylight savings", () => {
  assert.equal(gameWindow(game.kickoff), "afternoon");
  assert.equal(gameWindow("2026-11-09T01:20:00Z"), "evening");
  assert.equal(gameWindow("2026-10-04T17:00:00Z"), "early");
});
test("started windows cannot carry pregame targets forward", () => {
  const before = windowDecision(
    [game],
    [target],
    "2026-10-04",
    "afternoon",
    Date.parse("2026-10-04T20:00:00Z"),
  );
  assert.equal(before.candidates.length, 1);
  const after = windowDecision(
    [game],
    [target],
    "2026-10-04",
    "afternoon",
    Date.parse(game.kickoff),
  );
  assert.equal(after.scheduled.length, 1);
  assert.equal(after.upcoming.length, 0);
  assert.equal(after.candidates.length, 0);
});
test("empty records do not invent a PASS or a candidate", () => {
  assert.equal(
    windowDecision(
      [game],
      [],
      "2026-10-04",
      "afternoon",
      Date.parse("2026-10-04T20:00:00Z"),
    ).candidates.length,
    0,
  );
  assert.equal(
    windowDecision(
      [game],
      [target],
      "2026-10-05",
      "afternoon",
      Date.parse("2026-10-04T20:00:00Z"),
    ).scheduled.length,
    0,
  );
});

test("new research version supersedes an older high-ranked target", () => {
  const old = { ...target, analysis_version_id: "old", rank: 1 };
  const fresh = {
    ...target,
    id: "fresh",
    analysis_version_id: "new",
    rank: 2,
    updated_at: "2026-10-04T16:00:00Z",
  };
  const result = windowDecision(
    [game],
    [old, fresh],
    "2026-10-04",
    "afternoon",
    Date.parse("2026-10-04T20:00:00Z"),
  );
  assert.deepEqual(
    result.candidates.map((c) => c.id),
    ["fresh"],
  );
});
