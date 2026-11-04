# Story-only 24-hour lifetime

Prepared, not deployed. Additive `20261104101722_community_story_clock.sql` is **unapplied**.

A story is eligible when `created_at <= serverNowMs < created_at + STORY_TTL_MS`; TTL is exactly 86,400,000 milliseconds. The original server-created post timestamp is authoritative. Reads, editing, reopening, changing accounts and device time do not reset it. The ordinary Zone post, photo and discussion remain unchanged. Existing viewer-authorized feed/detail reads still supply content and enforce membership/age/block/deletion policies; the clock RPC authorizes no content.

## Interface for #215

- `community_story_clock()` returns `{version:1,server_now:timestamp}` for a signed-in authenticated caller, null without a UID; anon cannot execute. Security invoker, empty search path, no table access or identity fields. Uses statement-time, not transaction-start time.
- Before RPC dispatch capture `sentAtMs=performance.now()`. Validate version 1 on success, then `serverClock(data.server_now,sentAtMs,performance.now())` produces `StoryClock|null`.
- `storyNow(clock,performance.now())` gives projected epoch server milliseconds or null. Never use `Date.now()+offset`. Samples with invalid/backward times or RTT over 30 seconds are rejected. The 5-minute lease expires inclusively at 300,000ms; include that boundary in the next timer.
- Server timestamp plus the entire request RTT conservatively bounds response transit. With a healthy monotonic clock, content can disappear up to one RTT early, rather than survive expiry because of latency. This is not a claim of zero network clock uncertainty. Client projections require resync after sleep/background because some platforms pause performance clocks during sleep.
- On mount/account switch/focus/visibility/pageshow invalidate previous clock/content validation before display, synchronize, and discard responses from older request/account generations. While hidden, unknown, failed or stale, expose no new story content; revalidate current entry after resume. An older response must not move a newer anchor backwards. Account-scoped read state remains separate.
- `storyExpiresAt(created_at)` returns absolute expiry or null. `storyEligible(created_at,serverNowMs)` rejects invalid/unzoned/future timestamps and unknown/nonfinite time.
- `storyGroups(posts,serverNowMs)`, `unreadStories(rows,seen,serverNowMs)`, `storyDetail(data,request,current,serverNowMs)` and `displayedStoryRead(...,displayed,serverNowMs)` all fail closed if time is omitted. Filter at response application and render/read callback time, not just request dispatch.
- `stepStory(groups,cursor,direction,serverNowMs)` preserves original ordering, skips ineligible neighbors, permits stepping forward from an expired current item, and never wraps. Retain the original sequence for this transition; after re-grouping removes the cursor, choose the transition using the old sequence first. Missing cursors return null.
- Claude owns #215 rail/viewer timers and interactions. Schedule the earliest content expiry or clock-lease expiry, immediately hide expired current content, transition to the next eligible item or honest end/empty state. Clock refresh must not restart creation lifetime.

## Validation

Deterministic contracts cover before/exact/after expiry, future/invalid timestamps, mixed fresh/expired author groups, sequence expiry/no-wrap, delayed response/read callbacks, account guards, and monotonic time independent of device Date.now. Actual migration runs in PGlite with role/grant/null-UID/response-shape/statement-time checks. Browser open-view/background/history/tap/control interference and negative controls belong to combined execution with #215, not to pure helper tests.

No production migration, deployment or member-data mutation performed. Hosted advisors and real-device/browser checks are not claimed by these local tests.
