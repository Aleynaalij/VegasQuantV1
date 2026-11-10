import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  memberProfileLink,
  cardLabel,
  compactCount,
  isProfile,
  memberSince,
  socialHandle,
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

test("Instagram and X links render as handles only when they are plain profile URLs", () => {
  assert.equal(
    socialHandle("https://instagram.com/vegasquant", "instagram"),
    "@vegasquant",
  );
  assert.equal(
    socialHandle("https://www.instagram.com/vegas.quant/", "instagram"),
    "@vegas.quant",
  );
  assert.equal(socialHandle("https://x.com/VegasQuant", "x"), "@VegasQuant");
  assert.equal(
    socialHandle("https://twitter.com/VegasQuant", "x"),
    "@VegasQuant",
  );
  assert.equal(socialHandle("javascript:alert(1)", "x"), null);
  assert.equal(
    socialHandle("https://evil.com/instagram.com/x", "instagram"),
    null,
  );
  assert.equal(socialHandle(null, "x"), null);
  const src = readFileSync("src/components/member-profile.tsx", "utf8");
  assert.match(src, /rel="noopener noreferrer"/);
  assert.match(src, /on Instagram \(opens in a new tab\)/);
});

test("location is a US state only, shown by full name", async () => {
  const { stateName, US_STATES } = await import("../src/lib/member-profile");
  assert.equal(Object.keys(US_STATES).length, 51, "50 states plus DC");
  assert.equal(stateName("NV"), "Nevada");
  assert.equal(stateName("Northeast"), "");
  assert.equal(stateName(""), "");
});

test("your own profile opens an editor for photo, tagline, bio, state and social links", () => {
  const page = readFileSync("src/components/member-profile.tsx", "utf8");
  assert.match(page, /onClick=\{\(\) => setEditing\(true\)\}/);
  assert.match(page, /editing && profile\.is_me && uid/);
  const editor = readFileSync("src/components/profile-editor.tsx", "utf8");
  for (const field of [
    "avatar:",
    "tagline:",
    "bio:",
    "state:",
    "instagram_url:",
    "x_url:",
  ])
    assert.ok(editor.includes(field), field);
  assert.match(editor, /\.from\("community_profiles"\)\s*\.update\(/);
  assert.match(editor, /\.eq\("user_id", uid\)/);
});

test("no follower lists and no direct messages", () => {
  const page = readFileSync("src/components/member-profile.tsx", "utf8");
  const stats = page.slice(
    page.indexOf('className="vq-profile-stats"'),
    page.indexOf("</dl>"),
  );
  assert.doesNotMatch(
    stats,
    /<Link|<a |<button|onClick/,
    "follower and following counts are not clickable",
  );
  assert.doesNotMatch(
    page.replaceAll("MessageCircle", ""),
    /message|\bDM\b|inbox/i,
  );
});

test("contributor authors open stable member profiles while slip links stay separate", () => {
  assert.equal(
    memberProfileLink("00000000-0000-4000-8000-00000000000b"),
    "/community/00000000-0000-4000-8000-00000000000b",
  );
  const feed = readFileSync("src/components/community-feed.tsx", "utf8");
  assert.match(feed, /href=\{memberProfileLink\(lay.user_id\)\}/);
  assert.match(feed, /href=\{memberProfileLink\(p.user_id\)\}/);
  assert.match(feed, /className="zone-open" href=\{href\}/);
  const stories = readFileSync("src/components/story-viewer.tsx", "utf8");
  assert.match(stories, /href=\{memberProfileLink\(post.user_id\)\}/);
});
