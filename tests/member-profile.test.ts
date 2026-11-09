import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardLabel,
  compactCount,
  isProfile,
  memberSince,
} from "../src/lib/member-profile";

test("counts are compact like Instagram", () => {
  assert.deepEqual(
    [0, 999, 1000, 1284, 9999, 25000, 1_500_000].map(compactCount),
    ["0", "999", "1K", "1.3K", "10K", "25K", "1.5M"],
  );
});

test("member since reads month and year", () => {
  assert.equal(memberSince("2026-10-03T00:00:00Z"), "Member since Oct 2026");
  assert.equal(memberSince(null), "");
  assert.equal(memberSince("nope"), "");
});

test("Dealer card posts get a plain label", () => {
  assert.equal(cardLabel("nfl-wr:2026-11-08:1"), "NFL WR matchup card");
  assert.equal(cardLabel("vq-publication:v1"), "Vegas Quant pick");
  assert.equal(cardLabel(null), null);
});

test("profile data is shape-checked", () => {
  assert.ok(isProfile({ username: "a", followers: 1, posts: [] }));
  assert.ok(!isProfile({ username: "a", posts: [] }));
  assert.ok(!isProfile(null));
});

test("the profile page shows followers, following and posts, and no launch-era journey", () => {
  const src = readFileSync("src/components/member-profile.tsx", "utf8");
  assert.match(src, /supabase\.rpc\("community_profile"/);
  for (const label of ["Posts", "Followers", "Following"])
    assert.match(src, new RegExp(`<dt>${label}</dt>`));
  assert.doesNotMatch(src, /journey|challenge_number|stage_number/i);
  assert.match(src, /from\("member_follows"\)\s*\.insert/);
});
