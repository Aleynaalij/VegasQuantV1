import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  emptyPoll,
  isPollState,
  pollDraftProblem,
  pollOptions,
  pollPercents,
} from "../src/lib/zone-poll";

test("poll drafts mirror the database rules", () => {
  assert.equal(pollDraftProblem(emptyPoll()), "Add a poll question.");
  assert.equal(
    pollDraftProblem({ question: "Who wins?", options: ["BOS", ""] }),
    "Add at least two options.",
  );
  assert.equal(
    pollDraftProblem({ question: "Who wins?", options: ["BOS", "bos "] }),
    "Each option must be different.",
  );
  assert.match(
    pollDraftProblem({ question: "Q", options: ["a", "x".repeat(61)] }) || "",
    /under 60/,
  );
  assert.match(
    pollDraftProblem({ question: "x".repeat(141), options: ["a", "b"] }) || "",
    /under 140/,
  );
  assert.equal(
    pollDraftProblem({
      question: " Who wins? ",
      options: [" BOS ", "FLA", ""],
    }),
    null,
  );
  assert.deepEqual(
    pollOptions({ question: "Q", options: [" BOS ", "", "FLA"] }),
    ["BOS", "FLA"],
  );
});

test("percentages are whole numbers that add up to 100", () => {
  assert.deepEqual(pollPercents([0, 0]), [0, 0]);
  assert.deepEqual(pollPercents([1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(pollPercents([2, 1]), [67, 33]);
  assert.deepEqual(pollPercents([5, 0, 0, 0]), [100, 0, 0, 0]);
  for (const c of [
    [3, 7, 11],
    [1, 2, 3, 4],
    [9, 9, 2],
  ])
    assert.equal(
      pollPercents(c).reduce((a, b) => a + b),
      100,
    );
});

test("poll states from the server are shape-checked", () => {
  assert.ok(
    isPollState({
      post_id: "p",
      question: "Q",
      options: ["a", "b"],
      counts: [0, 1],
      total: 1,
      mine: null,
    }),
  );
  assert.ok(
    !isPollState({
      post_id: "p",
      question: "Q",
      options: ["a", "b"],
      counts: [0],
      total: 1,
      mine: null,
    }),
  );
  assert.ok(!isPollState(null));
});

test("the Zone composer offers a poll and the feed renders poll cards", () => {
  const feed = readFileSync("src/components/community-feed.tsx", "utf8");
  assert.match(feed, /onClick=\{\(\) => setPoll\(emptyPoll\(\)\)\}/);
  assert.match(feed, /supabase\.rpc\("create_community_poll_post"/);
  assert.match(feed, /<ZonePoll\s+state=\{polls\.states\[p\.id\]\}/);
  assert.match(
    feed,
    /disabled=\{busy \|\| \(!body\.trim\(\) && !photo && !poll\)\}/,
  );
  const sql = readFileSync(
    "supabase/migrations/20261108162552_community_polls.sql",
    "utf8",
  );
  assert.match(
    sql,
    /revoke all on public\.community_poll_votes from public, anon, authenticated;/,
  );
  assert.match(
    sql,
    /create function public\.create_community_poll_post[\s\S]*?security invoker/,
  );
});
