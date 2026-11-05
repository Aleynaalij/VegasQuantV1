const NOW = Date.parse("2026-11-03T14:00:00Z");
import test from "node:test";
import assert from "node:assert/strict";
import { storyDetail, storyGroups, stepStory, displayedStoryRead, storyDiscussion, type StoryPost } from "../src/lib/community-story-contracts";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (n: number, author: number, hour: number): StoryPost => ({ id: id(n), user_id: id(author), author_name: "Same display name", sport: "nhl", created_at: `2026-11-03T${hour}:00:00Z` });
const request = { viewerId: id(99), generation: 1, postId: id(1) };
const current = { viewerId: id(99), generation: 1 };
test("two authors: deterministic grouping, same-author then next-author navigation and boundaries", () => {
  const a = post(1, 10, 10), b = post(2, 10, 11), c = post(3, 20, 12), d = post(4, 20, 13);
  const groups = storyGroups([b, d, a, c, a], NOW);
  assert.deepEqual(groups.map(g => g.posts.map(p => p.id)), [[c.id, d.id], [a.id, b.id]]);
  assert.deepEqual(storyGroups([c, a, d, b], NOW), groups);
  assert.deepEqual(stepStory(groups, { authorId: c.user_id, postId: c.id }, 1, NOW), { authorId: d.user_id, postId: d.id });
  assert.deepEqual(stepStory(groups, { authorId: d.user_id, postId: d.id }, 1, NOW), { authorId: a.user_id, postId: a.id });
  assert.equal(stepStory(groups, { authorId: c.user_id, postId: c.id }, -1, NOW), null);
  assert.equal(stepStory(groups, { authorId: b.user_id, postId: b.id }, 1, NOW), null);
  assert.equal(stepStory(groups, { authorId: a.user_id, postId: id(777) }, 1, NOW), null);
});
test("equal timestamps use stable IDs and conflicting duplicate identities are not shown", () => {
  const a = post(1, 10, 10), b = post(2, 10, 10);
  assert.deepEqual(storyGroups([b, a], NOW)[0].posts, [a, b]);
  assert.deepEqual(storyGroups([a, { ...a, user_id: id(20) }], NOW), []);
  assert.deepEqual(storyGroups([{ ...a, created_at: "unknown" }], NOW), []);
});
test("only exact current-account authorized detail can be accepted; metadata is stripped", () => {
  const a = post(1, 10, 10);
  assert.deepEqual(storyDetail({ ...a, email: "private", staff: true, photo_path: "private" }, request, current, NOW), a);
  for (const data of [null, [], { ...a, id: id(2) }, { ...a, user_id: "display name" }, { ...a, sport: "basketball" }, { ...a, created_at: "invalid" }])
    assert.equal(storyDetail(data, request, current, NOW), null);
  assert.equal(storyDetail(a, request, { ...current, viewerId: null }, NOW), null);
  assert.equal(storyDetail(a, request, { ...current, viewerId: id(100) }, NOW), null);
  assert.equal(storyDetail(a, request, { ...current, generation: 2 }, NOW), null);
});
test("loading, failed, removed and account-switched stories remain unread", () => {
  const a = post(1, 10, 10);
  assert.deepEqual(displayedStoryRead([], a, request, current, false, NOW), []);
  assert.deepEqual(displayedStoryRead([], null, request, current, true, NOW), []);
  assert.deepEqual(displayedStoryRead([], a, request, { ...current, generation: 2 }, true, NOW), []);
  assert.deepEqual(displayedStoryRead([], a, request, current, true, NOW), [a.id]);
  assert.deepEqual(displayedStoryRead([a.id], a, request, current, true, NOW), [a.id]);
});
test("discussion keeps the exact sport/post identity and does not create an outbound action", () => {
  assert.equal(storyDiscussion(post(1, 10, 10)), `/community?sport=nhl&post=${id(1)}#post-${id(1)}`);
});
