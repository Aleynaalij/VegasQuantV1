import test from "node:test";
import assert from "node:assert/strict";
import {
  serverClock,
  STORY_TTL_MS,
  STORY_CLOCK_MAX_AGE_MS,
} from "../src/lib/community-story-contracts";
import { storyWakeDelay } from "../src/lib/story-expiry";
const epoch = Date.parse("2026-11-05T12:00:00Z");
const clock = serverClock(new Date(epoch).toISOString(), 100, 100)!;
test("timer wakes at the earliest original post expiry, then the clock lease", () => {
  const expiring = new Date(epoch - STORY_TTL_MS + 50).toISOString();
  assert.equal(storyWakeDelay(clock, 100, [expiring]), 50);
  assert.equal(
    storyWakeDelay(clock, 150, [expiring]),
    STORY_CLOCK_MAX_AGE_MS - 50,
  );
  assert.equal(storyWakeDelay(clock, 100, []), STORY_CLOCK_MAX_AGE_MS);
});
test("timer cannot reanimate expired content or a missing, stale or backward clock", () => {
  assert.equal(storyWakeDelay(null, 100, []), null);
  assert.equal(storyWakeDelay(clock, 99, []), null);
  assert.equal(storyWakeDelay(clock, 100 + STORY_CLOCK_MAX_AGE_MS, []), null);
  assert.equal(
    storyWakeDelay(clock, 100, [
      "bad",
      new Date(epoch - STORY_TTL_MS).toISOString(),
    ]),
    STORY_CLOCK_MAX_AGE_MS,
  );
});
