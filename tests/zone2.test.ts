import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  filterZone2Feed,
  zone2Publication,
  zone2Excerpt,
} from "../src/lib/zone2";
import { zoneFeed } from "../src/lib/zone-feed";
const post = {
  id: "one",
  title: "NBA rotation",
  body: "Observed minutes and role",
  sport: "nba",
  created_at: "2026-11-16T12:00:00Z",
  card: "vq-publication:v1",
};
test("research recognition uses actual publication markers, not author claims", () => {
  for (const card of [
    "vq-publication:v1",
    "nba-threes:2026-11-16",
    "nfl-wr:2026-11-15:1",
    "nfl-dvp:2026-11-15:2",
    "nhl-charts:00000000-0000-0000-0000-000000000001",
  ])
    assert.equal(zone2Publication({ card }), true);
  for (const card of [
    null,
    "",
    "TheDealer",
    "vq-publication:v1-fake",
    "nba-threes:bad",
    "nhl-charts:bad",
  ])
    assert.equal(zone2Publication({ card }), false);
});
test("search filters only authorized loaded content without mutating order/data", () => {
  const rows = zoneFeed(
    [post, { ...post, id: "two", card: null }],
    [{ id: "lay", created_at: post.created_at, title: "NBA lay" }],
  );
  assert.deepEqual(
    filterZone2Feed(rows, { query: " ROLE ", researchOnly: true }).map(
      (x) => x.id,
    ),
    ["one"],
  );
  assert.equal(
    filterZone2Feed(rows, { query: "nba", researchOnly: false }).length,
    3,
  );
  assert.equal(
    filterZone2Feed(rows, { query: "missing", researchOnly: false }).length,
    0,
  );
  assert.equal(rows.length, 3);
});
test("compact excerpts retain prose without making URLs primary content", () => {
  assert.equal(
    zone2Excerpt("Report\n https://example.com/a\n injury unknown"),
    "Report injury unknown",
  );
  assert.equal(zone2Excerpt("x".repeat(300)).length, 238);
});
test("Zone2 opts into existing social engine without changing legacy defaults", () => {
  const source = readFileSync("src/components/community-feed.tsx", "utf8");
  assert.match(source, /experience = "legacy"/);
  assert.match(source, /router.push\(`\$\{basePath\}/);
  assert.match(source, /hasTargetPost \|\| targetLay \? "" : researchQuery/);
  assert.match(
    source,
    /Zone2Publication enabled=\{zone2 && zone2Publication\(p\)\}/,
  );
});

test("compact publication source retains lazy mount and freshness disclosure", () => {
  // Presentation module imports CSS, so verify the mount guard at the boundary
  // without pretending this source check is rendered browser acceptance.
  const source = readFileSync(
    "src/components/zone2/zone2-presentation.tsx",
    "utf8",
  );
  assert.match(source, /expanded \? \(/);
  assert.match(source, /Publication time is not source freshness/);
  assert.match(
    source,
    /onToggle=\{\(e\) => setExpanded\(e.currentTarget.open\)\}/,
  );
});

test("Zone stories mount only once through the existing Shell", () => {
  const feed = readFileSync("src/components/community-feed.tsx", "utf8");
  const shell = readFileSync("src/components/ui.tsx", "utf8");
  assert.doesNotMatch(feed, /<CommunityStories/);
  assert.match(shell, /<CommunityStories/);
});
