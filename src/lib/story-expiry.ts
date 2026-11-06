import {
  STORY_CLOCK_MAX_AGE_MS,
  storyExpiresAt,
  storyNow,
  type StoryClock,
} from "./community-story-contracts";

/** Next exclusive boundary: original content expiry or the monotonic clock lease, never wall time. */
export function storyWakeDelay(
  clock: StoryClock | null,
  monotonicNow: number,
  created: readonly string[],
) {
  const now = storyNow(clock, monotonicNow);
  if (now === null || !clock) return null;
  const leaseLeft =
    STORY_CLOCK_MAX_AGE_MS - (monotonicNow - clock.receivedAtMs);
  const future = created
    .map(storyExpiresAt)
    .filter((v): v is number => v !== null && v > now);
  return Math.max(
    1,
    Math.ceil(Math.min(leaseLeft, ...future.map((t) => t - now))),
  );
}
