import assert from "node:assert/strict";
import { test } from "node:test";
import { stageHomeGames } from "../src/lib/home2";
import type { HubData } from "../src/lib/research-hub-reader";
const event = {
  key: "nba:fixture",
  sport: "nba" as const,
  id: "fixture",
  slug: "real-slug",
  away: "Away",
  home: "Home",
  start: "2026-11-18T01:00:00Z",
  status: "POSTPONED",
  source: "https://example.com/schedule",
  scheduleAt: "2026-11-17T12:00:00Z",
  tbd: false,
  venue: "Synthetic venue",
};
const data: HubData = {
  events: [event],
  findings: [],
  errors: [],
  denied: false,
  signedIn: true,
  truncated: false,
};
test("combined Home schedule uses exact guarded event identities and Eastern day, never findings or team-name inference", () => {
  const rows = stageHomeGames(data, Date.parse("2026-11-17T23:00:00Z"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start, event.start);
  assert.equal(rows[0].status, "POSTPONED");
  assert.equal(
    rows[0].href,
    "/staging/discovery/rooms/nba/fixture?date=2026-11-17",
  );
  assert.deepEqual(
    stageHomeGames(data, Date.parse("2026-11-18T12:00:00Z")),
    [],
  );
  for (const denied of [
    null,
    { ...data, denied: true },
    { ...data, signedIn: false },
  ])
    assert.deepEqual(stageHomeGames(denied, Date.now()), []);
  assert.deepEqual(
    stageHomeGames(
      { ...data, events: [{ ...event, id: "bad/path" }] },
      Date.parse("2026-11-17T23:00:00Z"),
    ),
    [],
  );
  assert.equal(data.events[0].start, event.start);
});
