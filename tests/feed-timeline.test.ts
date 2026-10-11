import test from "node:test";
import assert from "node:assert/strict";
import { feedTimeline } from "../src/lib/feed-timeline";
const posts = [
  { id: "1", created_at: "2026-10-11T00:02:00Z", category: "Decision" },
  { id: "2", created_at: "2026-10-10T23:30:00Z", category: "Watchlist" },
];
const selections = [{ id: "3", created_at: "2026-10-11T01:43:00Z" }];
const edges = [{ official_pick_id: "4", created_at: "2026-10-11T00:40:00Z" }];
test("All interleaves every publication newest first, including newest legs", () => {
  assert.deepEqual(
    feedTimeline(posts, selections, edges, "All").map((x) => x.key),
    ["selection:3", "edge:4", "post:1", "post:2"],
  );
});
test("Watchlist includes legs and watchlist posts, category filters remain isolated", () => {
  assert.deepEqual(
    feedTimeline(posts, selections, edges, "Watchlist").map((x) => x.key),
    ["selection:3", "post:2"],
  );
  assert.deepEqual(
    feedTimeline(posts, selections, edges, "Decision").map((x) => x.key),
    ["edge:4", "post:1"],
  );
  assert.equal(
    feedTimeline(posts, selections, edges, "Injury watch").length,
    0,
  );
});
test("pagination is applied after merging and stable for tied publication timestamps", () => {
  const additional = [
    { id: "a", created_at: selections[0].created_at },
    ...selections,
  ];
  const timeline = feedTimeline(posts, additional, edges, "All");
  assert.deepEqual(
    timeline.slice(0, 2).map((x) => x.key),
    ["selection:a", "selection:3"],
  );
  assert.deepEqual(
    timeline.slice(2).map((x) => x.key),
    ["edge:4", "post:1", "post:2"],
  );
  assert.equal(posts[0].id, "1");
});
