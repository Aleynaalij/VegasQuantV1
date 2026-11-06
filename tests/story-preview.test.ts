import test from "node:test";
import assert from "node:assert/strict";
import { buildStoryPreview } from "../src/lib/story-preview";
import {
  storyGroups,
  stepStory,
  storyEligible,
} from "../src/lib/community-story-contracts";

const now = "2026-11-06T17:00:00Z";
const viewer = "00000000-0000-4000-8000-000000000001";
test("preview has one labeled synthetic story per roster member without private fields", () => {
  const preview = buildStoryPreview(
    viewer,
    [
      {
        username: "MemberOne",
        avatar: "https://example.com/avatar.png",
        visible: false,
        email: "private@example.com",
      },
      { username: "MemberTwo", avatar: null },
    ],
    now,
  );
  assert.equal(preview.posts.length, 2);
  assert.equal(preview.members.length, 2);
  assert.equal(preview.viewerId, viewer);
  assert.ok(
    preview.posts.every((post) =>
      post.body.includes("not posted by this member"),
    ),
  );
  assert.ok(!JSON.stringify(preview).includes("private@example.com"));
  assert.equal(preview.members[0].avatar, "https://example.com/avatar.png");
  assert.ok(
    preview.posts.every((post) =>
      storyEligible(post.created_at, Date.parse(now)),
    ),
  );
  const groups = storyGroups(preview.posts, Date.parse(now));
  assert.equal(groups.length, 2);
  const next = stepStory(
    groups,
    { authorId: groups[0].authorId, postId: groups[0].posts[0].id },
    1,
    Date.parse(now),
  );
  assert.equal(next?.postId, groups[1].posts[0].id);
});
test("preview rejects invalid time and roster, filters malformed/duplicate names and caps at roster limit", () => {
  assert.throws(() => buildStoryPreview(viewer, {}, now));
  assert.throws(() => buildStoryPreview(viewer, [], "invalid"));
  assert.deepEqual(buildStoryPreview(viewer, [], now).posts, []);
  const preview = buildStoryPreview(
    viewer,
    [
      null,
      {},
      { username: " " },
      { username: "First" },
      { username: "first" },
      ...Array.from({ length: 510 }, (_, n) => ({ username: `Sample${n}` })),
    ],
    now,
  );
  assert.equal(preview.posts.length, 500);
  assert.equal(new Set(preview.posts.map((post) => post.id)).size, 500);
  assert.equal(new Set(preview.posts.map((post) => post.user_id)).size, 500);
  assert.ok(
    preview.posts.every(
      (post) => post.photo_path === null && post.legs.length === 0,
    ),
  );
  assert.equal(storyGroups(preview.posts, Date.parse(now)).length, 500);
});
