import test from "node:test";
import assert from "node:assert/strict";
import {
  readHomeDealer,
  homeDealerHref,
  HOME_DEALER_LIMIT,
} from "../src/lib/home-dealer";
const post = {
  id: "p",
  sport: "nba",
  title: "Published research",
  body: "Evidence",
  created_at: "2026-11-16T12:00:00Z",
};
test("signed-out users never query Dealer feed", async () => {
  const result = await readHomeDealer(
    {
      authenticated: async () => false,
      feed: async () => {
        throw new Error("must not read");
      },
    },
    "all",
  );
  assert.deepEqual(result, { state: "signed-out", posts: [] });
});
test("Dealer preview uses bounded sport-filtered authorized reader and preserves publication references", async () => {
  const result = await readHomeDealer(
    {
      authenticated: async () => true,
      feed: async (sport, limit) => {
        assert.equal(sport, "nba");
        assert.equal(limit, HOME_DEALER_LIMIT);
        return {
          data: Array.from({ length: 10 }, (_, i) => ({
            ...post,
            id: `p${i}`,
          })),
          error: null,
        };
      },
    },
    "nba",
  );
  assert.equal(result.state, "ready");
  assert.equal(result.posts.length, 3);
  assert.equal(result.posts[0].created_at, post.created_at);
});
test("errors and malformed response fail closed, without manufacturing content", async () => {
  for (const response of [
    { data: [post], error: "denied" },
    { data: {}, error: null },
  ]) {
    assert.deepEqual(
      await readHomeDealer(
        { authenticated: async () => true, feed: async () => response },
        "all",
      ),
      { state: "error", posts: [] },
    );
  }
  const empty = await readHomeDealer(
    {
      authenticated: async () => true,
      feed: async () => ({ data: [null, {}], error: null }),
    },
    "all",
  );
  assert.deepEqual(empty, { state: "ready", posts: [] });
});
test("publication links retain isolated Zone path and avoid Dealer feed mode hiding target", () => {
  assert.equal(
    homeDealerHref("/staging/discovery/zone?view=dealer", post),
    "/staging/discovery/zone?sport=nba&post=p#post-p",
  );
});
