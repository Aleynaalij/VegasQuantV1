import { test } from "node:test";
import assert from "node:assert/strict";
import { gameLinesDue, propsDue } from "../supabase/functions/source-sync/cadence";
import { upcomingPropEvents } from "../supabase/functions/source-sync/props";
const H = 3600000, now = Date.parse("2026-10-18T12:00:00Z");
test("game lines refresh every 2 hours, every 15 minutes near kickoff", () => {
  const sunday = [now + 5 * H];
  assert.equal(gameLinesDue(sunday, null, now), true);
  assert.equal(gameLinesDue(sunday, now - 90 * 60000, now), false);
  assert.equal(gameLinesDue(sunday, now - 2 * H + 30000, now), true); // cron jitter tolerated
  assert.equal(gameLinesDue([now + H], now - 15 * 60000, now), true);
  assert.equal(gameLinesDue([now + H], now - 10 * 60000, now), false);
  assert.equal(gameLinesDue([now - H, now + 9 * 24 * H], null, now), false); // nothing within a week
});
test("props quote only games within a day, every 30 minutes before kickoff", () => {
  assert.equal(propsDue([now + 30 * H], null, now), false);
  assert.equal(propsDue([now + 10 * H], now - 2 * H, now), false);
  assert.equal(propsDue([now + 10 * H], now - 3 * H, now), true);
  assert.equal(propsDue([now + H], now - 30 * 60000, now), true);
  assert.equal(propsDue([now + H], now - 20 * 60000, now), false);
});
test("prop events honour the horizon", () => {
  const game = { id: "g", home_team: "A", away_team: "B", kickoff: new Date(now + 30 * H).toISOString() };
  const event = { id: "e1", home_team: "A", away_team: "B", commence_time: game.kickoff };
  assert.equal(upcomingPropEvents([event], [game], now).events.length, 1);
  assert.equal(upcomingPropEvents([event], [game], now, 24, 24 * H).events.length, 0);
});
