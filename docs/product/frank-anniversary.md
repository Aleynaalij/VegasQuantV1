# Frank's one-time anniversary surprise

Owner request, Oct 31, 2026: after the full NHL/college basketball/NBA/ONE Zone/Slots release is deployed, surprise only Frank. Blur his Corner, wish him a happy anniversary, offer **Yes** or **Yes**, route either answer to NHL, and play fireworks there once. No yearly repeat, general announcement, email or push notification.

## Identity and state

The hosted unique, active `ruby_contributors.brand='FranksCorner'` row was verified against its existing community profile `username='Frank'`. No email/name guessing or UUID baked into client code. The migration pins that contributor's existing account once and stops if exactly one active owner cannot be found. If the brand later moves to another account, this feature hides instead of retargeting.

The config and receipts live privately with RLS and no member table access. `public.frank_anniversary(p_action,p_token)` is an authenticated-only SECURITY INVOKER wrapper around a guarded private function. Only the pinned, active Frank account with existing age access can receive an invitation or consume a handoff. Client query parameters cannot authorize a different account.

`status` returns hidden/offer/revealed/done. It never consumes anything. Either Yes calls `reveal`, creates at most one receipt, and returns the same pending token on double clicks or interrupted navigation. A previously revealed Corner resumes that handoff. The actual NHL view calls `arrive(token)`: an atomic conditional update awards celebrate to one caller; other tabs/devices/reloads get done. Turning the release flag off/on cannot reset the receipt. No localStorage-only completion marker or annual timer.

This is at-most-once server delivery of the celebration. If a tab disappears after its atomic receipt update but before rendering, no system can guarantee it was visually seen; the feature favors preventing repeat surprises. Network errors before a successful receipt response keep the handoff URL for retry. Development Strict Mode canceled mounts do not consume the receipt.

## Integration owned by Claude

Source is isolated from his claimed shell/routes/Zone files. Import the two exports from `@/components/frank-anniversary` (styles are imported by the component):

1. Mount `<FrankAnniversaryCorner />` once in the signed-in contributor's open Corner/desk. It checks its server identity; it must not mount for merely viewing a public Frank card, and must not mount indiscriminately across every page. The native modal blurs the backdrop, traps keyboard focus, displays the anniversary invitation and exactly two buttons labelled Yes. Escape temporarily dismisses the invitation without consuming it. Existing Corner content is unchanged.
2. Mount `<FrankAnniversaryFireworks />` once inside the real `/nhl` page after its normal readiness/access boundaries, not in a skeleton or prefetch. It consumes only a valid account-bound handoff. It strips only `vq-anniversary`, preserving unrelated query state and fragments. The five-second gold/white/mint fireworks overlay has a dismiss button; reduced-motion users get static stars and the greeting. There is no audio.
3. Apply `20261031170000_frank_anniversary.sql` during the combined release. It defaults DISABLED. No actual Frank receipt has been created by testing, and this task does not activate the hosted surprise early.
4. Finish/self-test both owners' full lists, audit/integrate PRs, deploy and verify the actual NHL, college, NBA, unified Zone and sport-selector flows. Only then enable the one-off release gate as the final release step:

```sql
update private.frank_anniversary_config
set enabled=true,released_at=now()
where singleton and target_user_id=(
 select user_id from public.ruby_contributors where brand='FranksCorner' and active
)
returning enabled,released_at;
```

Read back exactly one enabled row. Do not call reveal/arrive as Frank for verification: that would use up his real surprise. Verify authorized role/state behavior through synthetic tests. A disabled release flag is also the immediate off switch without altering receipts.

## Validation

`npm test`, `npm run typecheck`, `npm run build`; focused SQL contract `node tests/sql/frank-anniversary.mjs`. Tests cover unknown recipient migration refusal, anonymous/member access, disabled/future release, wrong account/age, no consumption on status, duplicate Yes, invalid/stolen handoff, replay across sessions, flag cycling and contributor reassignment.

`node scripts/ui-smoke/frank-anniversary.mjs` bundles the actual React components into an isolated synthetic local server; it never calls production. Use existing CI's Playwright installation or `PLAYWRIGHT_MODULE`/`PLAYWRIGHT_EXECUTABLE`. Run this script in the full frontend CI when integrating. Phone/desktop assertions cover release/identity gates, backdrop blur, Yes/Yes, keyboard focus/Escape, failed reveal retry, NHL navigation, one-time receipt across fresh browser storage, account changes, resumed navigation, Strict Mode, reduced motion and automatic dismissal. No shared workflow or fixture is overwritten by this PR.

Prepared source for the combined build; activation waits for the complete product release. No live user delivery or fully deployed UI is claimed by this document.
