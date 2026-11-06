# VQ Dealer publisher plan — draft only

Source baseline main `6cadc283608b655fc4321ab7144bec7533fbfea6`.
No new account, rename, role/permission change, history backfill or post publication is proposed
for activation in this batch. This document is a plan for review, not an enabled publisher.

## Existing identity and publication contract

[Automated Zone cards](../zone-automated-cards.md) currently binds the verified configured MikeQ
publisher to genuine server-origin publications. The provenance marker is not permission for a
member to claim official status. [NBA threes](../../supabase/migrations/20261029001000_nba_three_point_volume.sql)
uses the configured `private.zone_automation` identity and durable day/post marker. NBA editorial
[Zone publishing](../../supabase/migrations/20261031181000_nba_editorial_zone.sql) and
[provenance correction](../../supabase/migrations/20261031191226_zone_card_editorial_provenance.sql)
bind original journal, template, publication time and deterministic post identity. NHL/college
publish exact FanDuel selections under existing membership/age/admin and quote guards. NFL
research-board releases and deliberate editorial publication have their own gate/record classes.

Therefore changing only the rendered username would misrepresent the immutable original author.
Replacing the configured user without reviewing publisher checks, profile eligibility, journals,
notification effects and duplicate keys could break publication or attribution. No such change
is made here. A successful source collector does not create a VQ Dealer pick.

## Proposed representation

Use **VQ Dealer** as an explicit **editorial publisher identity**, visibly labelled “Vegas Quant
editorial research.” Keep the accountable human/operator and the existing auth actor separately
recorded; a display identity never confers administrator or contributor permissions. Prefer a
reviewed stable publisher entity/display contract with server-controlled attribution over renaming
MikeQ or granting a broadly privileged account solely for branding. This is a design preference,
not a schema decision or authorization to create an entity.

For future publications only, retain: publisher identity/version, original authenticated operator,
immutable publication/journal ID, source URLs and times, exact quote ID/book/market/price/time,
selection class, original body/template version, sport, original created time and duplicate key.
Edits/revisions must link immutable originals. Existing MikeQ posts and member engagement remain
attributed to the actual original publisher. No retrospective verified badge or author rewrite.

## Content classes and visible truth

| Class | Presentation | Required evidence / allowed actions |
| --- | --- | --- |
| Official editorial research | VQ Dealer + explicit editorial label and existing sport card color | Genuine approved publication path, exact journal/source bindings; never imply validated model or sportsbook ticket |
| Member opinion | Actual member profile and member-post label | Existing contributor/member eligibility and deliberate Publish; no automatic official marker or endorsement |
| Draft/template | Prominent DRAFT — NOT PUBLISHED; no feed engagement/verified ticket | Synthetic placeholders or named source-backed draft material only; no public Pick/Copy/Gambly controls until actual published legs exist |
| Published selection | Existing original post time, price/source context, risks and class | Original journal/exact quote; result initially pending, no inferred execution/stake/payout |
| Watch/research update | Explicit watcher/research classification | Actual concerns/sources; prose must not be parsed into invented recommended legs |

Sport appearance stays NFL blue, NHL red, college green, NBA gold. Existing once-only daily-card
markers, quotation windows, official-selection gates, age/eligibility checks, moderation, blocks
and source access remain. Copy/open controls operate only on stored published legs and existing
explicit destination/age confirmations. No unvalidated model probability, copied sportsbook slip,
trade or member follower count becomes official evidence.

## Synthetic draft template (not a pick)

> **DRAFT — NOT PUBLISHED · VQ Dealer · Vegas Quant editorial research**
>
> Sport: [sport]
>
> Research update: [source-backed topic; no selection until existing gates pass]
>
> Source: [URL] · source time: [if supplied] · retrieved: [timestamp]
>
> Exact stored quote: [quote ID, book, market and observed price; omit if absent]
>
> Reasoning: [supported observations]
>
> Concern / missing evidence: [specific uncertainty]
>
> Classification: [watch / research / existing approved editorial class]
>
> Status: draft; no executed position or settled outcome is represented.

Placeholders are intentionally unfilled. No synthetic player, odds, result, engagement or
verified ticket is used to make this look like a real recommendation.

## Exact decisions before implementation/release

1. Mike approves publisher display name, editorial label, accountable operator and any future
   stable identity contract. Decide whether a new entity/account is necessary; do not rename MikeQ.
2. Define future-only attribution fields and exact migration path, preserving legacy original
   author/history and existing journal/quote/notification bindings. Review each automatic and
   manual publisher; do not change global member/administrator roles.
3. Decide whether daily threes, NFL research, watchers and deliberate sport editorial posts all
   use Dealer branding or need distinct labels. Do not merge research/official record classes.
4. Approve how member follows, existing followers, profile discovery and feed filters should
   behave for editorial content. No implicit follower transfer or new broadcast audience.
5. Define publishing responsibility/review/rollback and verify the configured publisher can pass
   current eligibility checks without expanding access. Earned VIP/contributor roles are separate
   decisions, not part of this publisher plan.
6. Require composed server-provenance tests, member/service impersonation denial, duplicate retry,
   unchanged legacy author/posts/engagement, exact-source/time/quote binding, no-leg watcher
   behavior and phone/desktop rendering before a separate release approval.

Rollback must disable only the new future publisher mapping, retain immutable emitted evidence
and avoid rewriting old posts. A future rollout needs an explicit approved change and original-
versus-new readback; this document itself authorizes neither publication nor production mutation.
