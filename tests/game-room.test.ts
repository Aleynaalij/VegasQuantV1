import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  roomReference,
  gameRoomHref,
  resolveRoom,
  roomSources,
  roomPublicationHref,
} from "../src/lib/game-room";
import { stagingDiscoveryFixture as data } from "../src/lib/discovery/fixtures";
test("room references accept four sports, reject malformed IDs and dates", () => {
  for (const sport of ["nba", "nhl", "nfl", "ncaab"])
    assert.ok(roomReference(sport, "abc-123", "2026-11-16"));
  for (const [sport, id, date] of [
    ["mlb", "x", ""],
    ["nba", "../a", ""],
    ["nba", "x", "2026-02-30"],
    ["nba", "x", "2026-99-01"],
    ["nba", "x", "bad"],
  ])
    assert.equal(roomReference(sport, id, date), null);
});
test("room URL preserves sport, stable ID and Eastern date", () => {
  const event = { ...data.events[0], start: "2026-11-16T01:00:00Z" };
  assert.equal(
    gameRoomHref(event),
    `/staging/discovery/rooms/nfl/fixture-nfl?date=2026-11-15`,
  );
});
test("same teams or IDs in another sport never resolve a different game", () => {
  const result = resolveRoom(data, {
    sport: "nba",
    id: "fixture-nfl",
    date: "",
  });
  assert.equal(result.event, undefined);
  assert.deepEqual(result.findings, []);
});
test("date changes are explicit but exact identity remains authoritative", () => {
  const result = resolveRoom(data, {
    sport: "nba",
    id: "fixture-nba",
    date: "2026-11-14",
  });
  assert.ok(result.event);
  assert.equal(result.dateChanged, true);
  assert.ok(result.findings.length);
});
test("denied reader hides findings even when stale data is present", () => {
  assert.deepEqual(
    resolveRoom(
      { ...data, denied: true },
      { sport: "nba", id: "fixture-nba", date: "" },
    ).findings,
    [],
  );
});
test("source links are deduped and reject insecure/credential URLs", () => {
  const item = {
    ...data.findings[0],
    sources: [
      "https://nba.com/a",
      "https://nba.com/a",
      "javascript:alert(1)",
      "https://u:p@nba.com/a",
    ],
  };
  assert.deepEqual(roomSources([item]), ["https://nba.com/a"]);
});
test("publication references cannot navigate to external or executable targets", () => {
  assert.equal(
    roomPublicationHref("/community?post=abc#post-abc"),
    "/community?post=abc#post-abc",
  );
  for (const value of [
    "//evil.com",
    "javascript:alert(1)",
    "/\\evil.com",
    undefined,
  ])
    assert.equal(roomPublicationHref(value), null);
});
test("new room uses existing staging gate and revocation lifecycle, not a new auth system", () => {
  const page = readFileSync(
    "src/app/staging/discovery/rooms/[sport]/[id]/page.tsx",
    "utf8",
  );
  const client = readFileSync(
    "src/components/game-room/game-room-client.tsx",
    "utf8",
  );
  assert.match(page, /discoveryStagingEnabled\(process.env\)/);
  assert.match(client, /watchDiscoveryAccess/);
  assert.match(client, /setData\(EMPTY\)/);
  assert.match(client, /hadAccess.current/);
  assert.doesNotMatch(client, /service_role/);
});

test("room publications remain server opt-in and fixtures never read live publications", () => {
  const route = readFileSync(
    "src/app/staging/discovery/rooms/[sport]/[id]/page.tsx",
    "utf8",
  );
  const client = readFileSync(
    "src/components/game-room/game-room-client.tsx",
    "utf8",
  );
  assert.match(route, /STAGING_DISCOVERY_LINKED_PUBLICATIONS === "true"/);
  assert.match(client, /linkedPublications && !fixtures/);
});

test("linked charts use existing permission-aware renderers and clear on access changes", () => {
  const source = readFileSync(
    "src/components/game-room/room-publications.tsx",
    "utf8",
  );
  const view = readFileSync(
    "src/components/game-room/game-intelligence-room.tsx",
    "utf8",
  );
  assert.match(source, /supabase\.rpc\("game_zone_posts"/);
  assert.match(source, /p_game: reference.id/);
  assert.match(source, /own !== generation/);
  assert.match(source, /setPosts\(\[\]\)/);
  assert.match(source, /watchDiscoveryAccess/);
  assert.match(source, /rows.some\(\(p\) => p.sport !== reference.sport\)/);
  assert.match(source, /nba-matchup-sheet-preview/);
  assert.match(source, /nhl-chart-preview/);
  assert.match(
    source.replace(/\s+/g, " "),
    /Other card formats and attachments remain/,
  );
  assert.match(view, /!data.denied/);
  assert.match(view, /data.signedIn/);
  assert.doesNotMatch(source, /service_role|SUPABASE_SERVICE|\.from\(/);
});
