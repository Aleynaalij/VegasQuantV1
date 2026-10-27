import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gameLinesDue,
  propsDue,
  propEventDue,
  PROPS_HORIZON,
} from "../supabase/functions/source-sync/cadence";
import { upcomingPropEvents } from "../supabase/functions/source-sync/props";
const H = 3600000,
  now = Date.parse("2026-10-18T12:00:00Z");
test("game lines refresh every 2 hours, every 15 minutes near kickoff", () => {
  const sunday = [now + 5 * H];
  assert.equal(gameLinesDue(sunday, null, now), true);
  assert.equal(gameLinesDue(sunday, now - 90 * 60000, now), false);
  assert.equal(gameLinesDue(sunday, now - 2 * H + 30000, now), true); // cron jitter tolerated
  assert.equal(gameLinesDue([now + H], now - 15 * 60000, now), true);
  assert.equal(gameLinesDue([now + H], now - 10 * 60000, now), false);
  assert.equal(gameLinesDue([now - H, now + 9 * 24 * H], null, now), false); // nothing within a week
});
test("props research seven days ahead with six-hour distant refresh and fast lock refresh", () => {
  assert.equal(propsDue([now + 30 * H], null, now), true);
  assert.equal(propsDue([now + 10 * H], now - 2 * H, now), false);
  assert.equal(propsDue([now + 10 * H], now - 3 * H, now), true);
  assert.equal(propsDue([now + 2 * H], now - 15 * 60000, now), true);
  assert.equal(propsDue([now + 2 * H + 1], now - 15 * 60000, now), false);
  assert.equal(propsDue([now + H], now - 15 * 60000, now), true);
  assert.equal(propsDue([now + H], now - 10 * 60000, now), false);
  assert.equal(propsDue([now + H], now - 15 * 60000 + 30000, now), true);
  assert.equal(propsDue([now, now - H], null, now), false);
});
test("prop events honour the horizon", () => {
  const game = {
    id: "g",
    home_team: "A",
    away_team: "B",
    kickoff: new Date(now + 30 * H).toISOString(),
  };
  const event = {
    id: "e1",
    home_team: "A",
    away_team: "B",
    commence_time: game.kickoff,
  };
  assert.equal(upcomingPropEvents([event], [game], now).events.length, 1);
  assert.equal(
    upcomingPropEvents([event], [game], now, 24, 24 * H).events.length,
    0,
  );
});

test("distant event polling stays slow even with another game near kickoff", () => {
  assert.equal(PROPS_HORIZON, 7 * 24 * H);
  assert.equal(propEventDue(now + 48 * H, now - 3 * H, now), false);
  assert.equal(propEventDue(now + 48 * H, now - 6 * H, now), true);
  assert.equal(propEventDue(now + 24 * H, now - 3 * H, now), true);
  assert.equal(propEventDue(now + 24 * H + 1, now - 3 * H, now), false);
  assert.equal(propEventDue(now + 7 * 24 * H, null, now), true);
  assert.equal(propEventDue(now + 7 * 24 * H + 1, null, now), false);
  assert.equal(propEventDue(now, null, now), false);
  assert.equal(propEventDue(NaN, null, now), false);
  assert.equal(propsDue([now + H, now + 48 * H], now - 15 * 60000, now), true);
  assert.equal(propEventDue(now + 48 * H, now - 15 * 60000, now), false);
});
