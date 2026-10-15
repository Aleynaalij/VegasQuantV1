import test from "node:test";
import assert from "node:assert/strict";
import { forYou, suggestedTeams } from "../src/lib/for-you";

const games = [
  { id: "past", slug: "past", kickoff: "2026-10-01T00:15:00Z", away_team: "Buffalo Bills", home_team: "Miami Dolphins" },
  { id: "sun", slug: "bills-jets", kickoff: "2026-10-18T17:00:00Z", away_team: "Buffalo Bills", home_team: "New York Jets" },
  { id: "thu", slug: "sea-den", kickoff: "2026-10-16T00:15:00Z", away_team: "Seattle Seahawks", home_team: "Denver Broncos" },
];
const posts = [
  { id: "old", title: "Bills injury note", matchup: "Bills @ Dolphins", game_id: "past", created_at: "2026-10-01T10:00:00Z" },
  { id: "new", title: "Cook ball security is a role risk", matchup: "Bills @ Jets", game_id: "sun", created_at: "2026-10-14T10:00:00Z" },
  { id: "jsn", title: "Seahawks–Broncos · JSN stays limited", matchup: "Seahawks @ Broncos", summary: "Jaxon Smith-Njigba limited", game_id: "thu", created_at: "2026-10-13T10:00:00Z" },
];
const now = Date.parse("2026-10-14T12:00:00Z");

test("a followed team gets its next game and newest matching update", () => {
  const [bills] = forYou([{ kind: "team", topic: "buffalo bills" }], games, posts, now);
  assert.equal(bills.game?.id, "sun");
  assert.equal(bills.post?.id, "new");
});

test("a followed player matches update text; unknown follows stay empty", () => {
  const [jsn, nobody] = forYou([{ kind: "player", topic: "Jaxon Smith-Njigba" }, { kind: "team", topic: "Chicago Bears" }], games, posts, now);
  assert.equal(jsn.game, null);
  assert.equal(jsn.post?.id, "jsn");
  assert.deepEqual([nobody.game, nobody.post], [null, null]);
});

test("suggested teams are this week's teams, soonest first, minus follows", () => {

  assert.deepEqual(suggestedTeams(games, [], now), ["Seattle Seahawks", "Denver Broncos", "Buffalo Bills", "New York Jets"]);
  assert.deepEqual(
    suggestedTeams(games, [{ kind: "team", topic: "seattle seahawks" }, { kind: "player", topic: "Buffalo Bills" }], now),
    ["Denver Broncos", "Buffalo Bills", "New York Jets"],
  );
});
