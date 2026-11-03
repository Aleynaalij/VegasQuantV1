# Typed community reactions — draft integration contract

Depends on #204 at `86d1d30f0f2842dd452a91431f664ff78debe794`; no Claude UI edits. Migration `20261103181103_community_typed_reactions.sql` was generated with the CLI and is **NOT APPLIED**. Existing component/Like API continues working before and after deployment. This is a reviewable implementation draft, not release approval.

## Exact API for Claude

`community_reaction_state({p_post: UUID})` returns null for missing/unavailable posts, or:

```json
{"version":1,"post_id":"POST_UUID","total":2,"counts":{"heart":1,"celebrate":0,"fire":1,"thinking":0},"mine":"heart"}
```

`set_community_reaction({p_post: UUID,p_reaction: "heart" | "celebrate" | "fire" | "thinking" | null})` returns the same canonical shape. Null removes; absent argument defaults to heart. No actor parameter; identity comes from the authenticated request. It SETS desired state: retries of `fire` remain `fire`. The UI uses `nextReaction(current,choice)` to compute same-choice removal, then retains that desired value across a failed request/retry. Never recompute a toggle from stale optimistic state.

`community-reaction-contracts.ts` validates version, exact post ID, allowlisted types, nonnegative integer counts, total reconciliation and current-user count consistency. This is presentation validation, not authorization. On failure keep/restore previous canonical state, display retry, and ignore any old account/generation response. Disable/serialize in-flight changes for that post. Refresh canonical counts on re-entry; do not label optimistic counts as committed.

Like and emoji are one mutually exclusive reaction per account/post. Heart remains Like; alternatives are Celebrate, Fire and Thinking. Picker controls need accessible names/selected state; retain existing comment/reply and comment-heart functionality. This draft does not add typed comment reactions. Totals count people, not taps; per-type counts sum to total. Existing binary `reacted` fields still mean any row exists, so new typed UI must use `mine`, not infer heart from old feed `reacted`.

Before the migration is released, an unavailable new RPC must not be represented as persisted emoji support. Keep the current working Like path and show unavailable/retry for the typed feature in a draft preview. Do not simulate success in local component state.

## Persistence and access

- Existing `(post_id,user_id)` primary key unchanged; new `reaction_type NOT NULL DEFAULT 'heart'` and bounded CHECK. Old direct insert/delete clients remain compatible.
- Public setter is invoker; narrowly scoped private definer handles atomic replacement without granting table UPDATE. No caller-supplied actor. Explicit age/session eligibility, confirmed/non-banned actor, restrictions/erasure and current-target/block checks precede writes.
- Per-actor/post transaction lock serializes new setter calls. Replacement deletes/reinserts **within the same PostgreSQL statement/transaction** so all original safety, rate and notification triggers execute; an error rolls back the prior row and trigger effects. It is not a client-side delete followed by a separate network insert.
- Additional insert guard covers direct old-client writes too, preventing the new setter from becoming the only enforcement path. No new anon grant, table UPDATE grant, ownership policy relaxation or subscription entitlement requirement.
- Reads remain exact-post, age-checked and viewer-authorized; aggregate summaries contain no actor identities. No public preview/count endpoint is added.
- Existing heart notification trigger and event dedupe remain. Only heart inserts invoke it. Alternative choices are silent, avoiding misleading Like notifications or new consent/delivery paths. Re-selecting heart reuses existing event-key dedupe. Declined Like preferences still suppress creation. #200's broader notification/access release remains separate.

## Verification evidence and limits

The new SQL fixture loads actual original community table/RLS, launch safety and social notification migrations, then the draft. It exercises legacy hearts, desired-state idempotence, choose/change/remove, counts, denied table UPDATE/forged actor/invalid enum, atomic rollback on injected failure, original rate limit, both block directions, restricted/age/banned/erasure/missing/deleted cases and anon RPC/table denial. Existing notification emitter/preference behavior runs locally; no deliveries are sent. Auth/age/session infrastructure is an explicit fixture seam, not a production-auth acceptance claim.

Local targeted tests and TypeScript results are reported on the PR/checkpoint. Negative controls deliberately remove emoji-notification filtering and erasure protection; each must fail an intended assertion. Real concurrent PostgreSQL sessions, real auth/devices, mounted emoji browser flow and production advisors are not run locally. Do not claim race/real-device/production acceptance from PGlite's serialized execution.

## Release and rollback dependency

Review source/ACLs, run advisors against a local complete Supabase stack when available, read exact-head CI execution and combine with Claude's exact delivered UI/browser/negative-control packet before asking Elo for a concrete release decision. No migration application in this task. Schema first, then typed UI; preserve old clients throughout.

Application rollback can keep the additive column/RPCs in place while returning to binary hearts; do not drop or collapse existing emoji choices or notify users again. Full schema rollback requires a separately reviewed data-preserving plan. No automatic production rollback SQL, post mutation or access change is included.
