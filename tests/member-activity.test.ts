import test from "node:test";
import assert from "node:assert/strict";
import { activity, sortMembers } from "../src/lib/member-activity";

const now = Date.parse("2026-10-15T20:00:00Z");
test("activity reads in plain language", () => {
  assert.deepEqual(activity(null, now), { label: "Never logged in", tone: "never" });
  assert.equal(activity("2026-10-15T19:30:00Z", now).label, "Active in the last hour");
  assert.equal(activity("2026-10-15T15:00:00Z", now).label, "Active 5h ago");
  assert.equal(activity("2026-10-14T19:00:00Z", now).label, "Active 1 day ago");
  assert.equal(activity("2026-10-12T19:00:00Z", now).tone, "recent");
  assert.deepEqual(activity("2026-10-01T19:00:00Z", now), { label: "Idle 14 days", tone: "idle" });
});
test("members sort by activity, sign-up or idleness", () => {
  const rows = [
    { id: "a", last_active: "2026-10-15T10:00:00Z", created_at: "2026-10-01T00:00:00Z" },
    { id: "b", last_active: null, created_at: "2026-10-10T00:00:00Z" },
    { id: "c", last_active: "2026-10-02T10:00:00Z", created_at: "2026-10-05T00:00:00Z" },
  ];
  assert.deepEqual(sortMembers(rows, "active").map((r) => r.id), ["a", "c", "b"]);
  assert.deepEqual(sortMembers(rows, "newest").map((r) => r.id), ["b", "c", "a"]);
  assert.deepEqual(sortMembers(rows, "idle").map((r) => r.id), ["b", "c", "a"]);
});
