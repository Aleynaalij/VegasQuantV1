import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  applyVote,
  formatScore,
  isVoteState,
  nextVote,
  type VoteState,
} from "../src/lib/zone-votes";

const base: VoteState = { post_id: "p", up: 5, down: 2, score: 3, mine: null };

test("tapping the same arrow clears, the other arrow switches", () => {
  assert.equal(nextVote(null, 1), 1);
  assert.equal(nextVote(1, 1), null);
  assert.equal(nextVote(1, -1), -1);
  assert.equal(nextVote(-1, -1), null);
});

test("optimistic updates keep up, down and score consistent", () => {
  const up = applyVote(base, 1);
  assert.deepEqual([up.up, up.down, up.score, up.mine], [6, 2, 4, 1]);
  const down = applyVote(up, -1);
  assert.deepEqual([down.up, down.down, down.score, down.mine], [5, 3, 2, -1]);
  const cleared = applyVote(down, null);
  assert.deepEqual(
    [cleared.up, cleared.down, cleared.score, cleared.mine],
    [5, 2, 3, null],
  );
});

test("scores are compact like Reddit", () => {
  assert.deepEqual(
    [0, 999, -4, 1000, 1234, 9999, 25000, -1500].map(formatScore),
    ["0", "999", "-4", "1k", "1.2k", "10k", "25k", "-1.5k"],
  );
});

test("server states are shape-checked", () => {
  assert.ok(isVoteState(base));
  assert.ok(!isVoteState({ ...base, mine: 2 }));
  assert.ok(!isVoteState(null));
});

test("every Zone post shows the vote control; scores reload with the feed and ignore stale accounts", () => {
  const feed = readFileSync("src/components/community-feed.tsx", "utf8");
  assert.match(
    feed,
    /useZoneVotes\(\s*rows\.map\(\(x\) => x\.id\),\s*uid,\s*rows,\s*\)/,
  );
  assert.match(
    feed,
    /<div className="zone-actions">\s*\{votes\.states\[p\.id\] \? \(\s*<VoteControl/,
  );
  const hook = readFileSync("src/components/zone-votes.tsx", "utf8");
  assert.match(hook, /\[key, uid, refresh\]/);
  assert.match(hook, /if \(account\.current !== owner\) return true;/);
  // A read that started before or during a vote keeps the post's newer state.
  assert.match(hook, /const started = \{ \.\.\.mutations\.current \};/);
  assert.match(hook, /inFlight\.current\.has\(s\.post_id\)/);
  const sql = readFileSync(
    "supabase/migrations/20261108170014_community_post_votes.sql",
    "utf8",
  );
  assert.match(
    sql,
    /revoke all on public\.community_post_votes from public, anon, authenticated;/,
  );
});
