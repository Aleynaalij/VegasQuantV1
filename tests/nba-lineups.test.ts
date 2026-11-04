import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNbaLineups,
  lineupForGame,
  lineupOuts,
  NBA_LINEUP_MAX_AGE_MS,
  lineupTeam,
} from "../src/lib/nba-lineups";
const NOW = Date.parse("2026-11-04T20:00:00Z");
function side(team: string, home: boolean, confirmed: boolean) {
  return `<a class="lineup__team ${home ? "is-home" : "is-visit"}"><div class="lineup__abbr">${team}</div></a><ul class="lineup__list ${home ? "is-home" : "is-visit"}"><li class="lineup__status ${confirmed ? "is-confirmed" : "is-expected"}">${confirmed ? "Confirmed" : "Expected"} Lineup</li>${["PG", "SG", "SF", "PF", "C"].map((pos, n) => `<li class="lineup__player"><div class="lineup__pos">${pos}</div><a title="Sample ${team} Player ${n}" href="/basketball/player/sample-${(home ? 20 : 10) + n}">S. Player</a></li>`).join("")}<li class="lineup__title">MAY NOT PLAY</li><li class="lineup__player"><div class="lineup__pos">F</div><a title="Sample Inactive Forward" href="/basketball/player/sample-out-${home ? 50 : 51}">S. Forward</a><span class="lineup__inj">Out</span></li></ul>`;
}
const block = (confirmed = false) =>
  `<div class="lineup is-nba"><div class="lineup__time">7:30 PM ET</div>${side("MIL", false, confirmed)}${side("BOS", true, confirmed)}</div>`;
const page = (body = block(), day = "2026-11-04") =>
  `<main data-gamedate="${day}">${body}</main>`;
const identity = { away: "MIL", home: "BOS", start: "2026-11-05T00:30:00Z" };
test("expected starters are never labelled confirmed, while explicit Out is already surfaced", () => {
  const r = parseNbaLineups(page(), NOW),
    g = lineupForGame(r, identity, NOW)!;
  assert.equal(g.away.status, "expected");
  assert.equal(g.home.status, "expected");
  assert.deepEqual(lineupOuts(g), [
    "Sample Inactive Forward (MIL)",
    "Sample Inactive Forward (BOS)",
  ]);
  assert.equal(g.home.availability[0].name, "Sample Inactive Forward");
  assert.equal(g.home.availability[0].id, "50");
});
test("only explicit provider-confirmed complete, distinct starting fives are confirmed", () => {
  const html = page(block(true)),
    r = parseNbaLineups(html, NOW);
  assert.equal(r.games[0].home.status, "confirmed");
  assert.equal(r.games[0].home.starters.length, 5);
  for (const modified of [
    html.replace("is-confirmed", "is-expected"),
    html.replace("Confirmed Lineup", "Expected Lineup"),
    html.replace("sample-11", "sample-10"),
    html.replace(">SG<", ">PG<"),
    html.replace('<div class="lineup__pos">PG</div>', ""),
  ]) {
    assert.notEqual(
      parseNbaLineups(modified, NOW).games[0].away.status,
      "confirmed",
    );
  }
});
test("Out starter contradiction fails closed; short names never identify players", () => {
  const html = page(block(true)).replace("sample-out-51", "sample-out-10");
  const g = parseNbaLineups(html, NOW).games[0];
  assert.equal(g.away.status, "unavailable");
  assert.deepEqual(g.away.starters, []);
  const missing = page().replace('title="Sample BOS Player 0"', "");
  assert.equal(
    parseNbaLineups(missing, NOW).games[0].home.status,
    "unavailable",
  );
});
test("match exact ET date, ordered team identities and start time; duplicate games are ambiguous", () => {
  const r = parseNbaLineups(page(), NOW);
  assert(lineupForGame(r, identity, NOW));
  for (const game of [
    { ...identity, home: "MIL", away: "BOS" },
    { ...identity, start: "2026-11-05T01:30:00Z" },
    { ...identity, start: "2026-11-06T00:30:00Z" },
    { ...identity, tbd: true },
    { ...identity, away: "unknown" },
  ])
    assert.equal(lineupForGame(r, game, NOW), null);
  assert.equal(
    lineupForGame({ ...r, games: [...r.games, ...r.games] }, identity, NOW),
    null,
  );
  assert.deepEqual(parseNbaLineups(page(block() + block()), NOW).games, []);
  assert.equal(lineupTeam("GS"), "GSW");
  assert.equal(lineupTeam("BOS"), "BOS");
  assert.equal(lineupTeam("BOSTON"), null);
});
test("wrong-date/blocked/malformed/oversized sources fail rather than inventing starters", () => {
  for (const html of [
    page(block(), "2026-11-03"),
    "<html>Login required</html>",
    page("<p>Unavailable</p>"),
    "x".repeat(1_000_001),
  ])
    assert.throws(() => parseNbaLineups(html, NOW));
  assert.throws(() => parseNbaLineups(page(), NaN));
});
test("stale, future, invalid, next-day and boundary clocks cannot display old availability as current", () => {
  const r = parseNbaLineups(page(), NOW);
  assert(lineupForGame(r, identity, NOW + NBA_LINEUP_MAX_AGE_MS - 1));
  for (const now of [
    NOW - 1,
    NOW + NBA_LINEUP_MAX_AGE_MS,
    NaN,
    Infinity,
    Date.parse("2026-11-05T06:00:00Z"),
  ])
    assert.equal(lineupForGame(r, identity, now), null);
  assert.equal(lineupForGame({ ...r, checked_at: "bad" }, identity, NOW), null);
});
test("HTML is plain data, full provider names decode entities, and script content cannot add a lineup", () => {
  const r = parseNbaLineups(
    page(`<script>${block(true)}</script>${block()}`).replaceAll(
      "Sample BOS Player 0",
      "Sample &amp; Home",
    ),
    NOW,
  );
  assert.equal(r.games.length, 1);
  assert.equal(r.games[0].home.starters[0].name, "Sample & Home");
  assert.equal(r.games[0].home.status, "expected");
});
