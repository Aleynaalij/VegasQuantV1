import test from "node:test";
import assert from "node:assert/strict";
import { ago, initials, zoneFeed } from "../src/lib/zone-feed";

test("The Zone is one timeline: posts and VIP lays, newest first", () => {
  const posts = [
    { id: "p1", created_at: "2026-10-29T14:00:00Z" },
    { id: "p2", created_at: "2026-10-29T10:00:00Z" },
  ];
  const lays = [{ id: "l1", created_at: "2026-10-29T12:00:00Z" }];
  assert.deepEqual(
    zoneFeed(posts, lays).map((i) => `${i.kind}:${i.id}`),
    ["post:p1", "lay:l1", "post:p2"],
  );
  assert.deepEqual(
    zoneFeed(posts, lays, true).map((i) => i.id),
    ["l1"],
  );
});

test("Feed times read like a social app", () => {
  const now = Date.parse("2026-10-29T20:00:00Z");
  assert.equal(ago("2026-10-29T19:59:30Z", now), "now");
  assert.equal(ago("2026-10-29T19:15:00Z", now), "45m");
  assert.equal(ago("2026-10-29T15:00:00Z", now), "5h");
  assert.equal(ago("2026-10-26T20:00:00Z", now), "3d");
  assert.equal(ago("2026-10-14T20:00:00Z", now), "Oct 14");
});

test("Avatar initials", () => {
  assert.equal(initials("MikeQ"), "MQ");
  assert.equal(initials("sharp_sarah"), "SS");
  assert.equal(initials("bob"), "BO");
  assert.equal(initials(""), "?");
});
