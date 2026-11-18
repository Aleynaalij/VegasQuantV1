# Authenticated experience acceptance ledger

This continuation is stacked on #300 at `9b9aee28e3d310897c4bed102faa98ff2709a8eb`. Reviewed #295/#296/#297/#300 source branches are preserved. The draft PR conversation records the exact candidate SHA and links to its own results; previous green CI is not inherited. Production remains NO-GO.

## Session boundary

The combined shell uses one verified HttpOnly identity, not the stateless browser SDK or old localStorage. `/staging/discovery/session` GET verifies the live private-access session, independent synthetic age and original entitlement, obtains the own user from isolated Auth, whitelists display fields, and repeats live authorization before returning. No bearer/refresh token, arbitrary metadata, other-user selector or upstream URL is returned. The application identity type is not an SDK Session. Ordinary production authentication retains the existing SDK behavior.

The volatile client store clears identity before focus/pageshow/visibility/60-second revalidation, aborts old reads, rejects late response restoration and propagates cross-tab sign-out invalidation. Server authorization remains authoritative on every request; browser polling is not instant revocation. POST sign-out requires the exact deployment Origin, revokes the local Auth session and clears the secure HttpOnly cookie only on confirmed success. A failed revocation reports unavailable and retains the retry cookie. No new SDK signup, enrollment or account-management authority exists in combined mode.

`/staging/discovery/data` is a narrowly allowlisted same-origin bridge for existing query consumers. The browser strips SDK credentials. The server forwards only reviewed read RPCs (`age_verification_status`, `membership_status`, `sports_slate`, `game_zone_posts`) with fixed argument shapes to the one isolated project. It checks live gate, age and entitlement before, and live gate after reads. Arbitrary tables, schemas, user IDs, APIs, notification synchronization/dispatch, account/billing operations, storage and mutations are unavailable. There is no generic privileged proxy, service-role credential, production fallback or simulated success for unsupported features.

## Journey matrix

`Working` below means a specifically bounded synthetic/local result, never real hosted acceptance. All real-session journeys are not yet tested. A retained route/file is not functional parity.

| Journey / route | Supported contract | Status and evidence |
|---|---|---|
| Shell identity, Account /membership | GET /staging/discovery/session, token-free viewer identity | Implemented; synthetic endpoint/lifecycle tests; consumer adaptation and browser acceptance tracked on draft |
| Age and entitlement | Same live session + age_verification_status + membership_status | Working in synthetic endpoint/SQL negative controls; hosted not yet tested |
| Sign-out, expiration, revocation | POST /staging/discovery/session; live auth.sessions checks | Synthetic transport/lifecycle tests; real Auth revocation and owner recovery not yet tested |
| Home Dealer research | GET /staging/discovery/read/dealer; vq-stage-dealer-v1 | Existing guarded synthetic projection retains original IDs/body/source/time; real hosted not yet tested |
| Home schedules, game navigation | GET /staging/discovery/read/research; guarded HubData | Existing connected synthetic Home-to-Room browser suite; new exact-head run required |
| Game Room research, all four sports | Same research reader + existing sport adapters | Existing synthetic reader tests; populated/empty browser parity still needs independent acceptance |
| Original game discussion/deep links | game_zone_posts(p_sport,p_game,p_limit) | Read contract allowlisted; linked publication feature remains disabled pending source/authorship acceptance |
| Zone stories /community | community_stories/story-state functions | Blocked: no verified isolated social schema/RLS/trigger contract |
| Comments, reactions, following | community_* / game_comments / member_follows | Blocked: no verified isolated mutation/read contracts; no outbound notification effects authorized for staging |
| Saved content / My Lays / Build a Lay | saved_legs, saved_parlays, published_leg_catalog and existing workshop contracts | Blocked: fixture lacks stores/RPCs; verified identity alone does not establish feature readiness |
| Account/profile | community_profiles and existing setup/update contracts | Blocked: absent isolated profile contract; no production account changes or fake setup success |
| Notifications /notifications | notification_counts, inbox/preferences and read mutations | Blocked: absent isolated contracts; unavailable must not render as zero unread success; no push/email dispatch |
| Full NBA research charts/downloads | /api/nba/matchup-sheet/[id], original community_posts + NBA source history | Blocked: absent original publication/source contracts; legacy bearer path remains denied, not replaced with invented sheet |
| Native Dealer publication PNG | Existing client-side publication card renderer | Preserved source; authenticated full journey not yet tested on this candidate |
| Direct database access/cross-user isolation | Existing restrictive RLS + own entitlement/age records | Existing disposable SQL gate/worker/rollback tests retained; new endpoint rejects user selectors; hosted not yet tested |
| Storage / realtime | No buckets / published tables | Read-only catalog verified zero; bridge rejects storage/auth URLs and CSP denies cross-origin connections; hosted real-token negative tests not yet tested |
| Worker / publication preservation | Existing separate service identity and schedules | Existing local SQL worker append/rollback evidence retained; no production execution or schedule edits |

## Read-only hosted observations

November 17 Eastern checks: Vercel project `prj_nOLCSmAPzjc5jayXwJ2gJNYXIT9P` still has one custom environment allowance and zero configured environments. Project-level Vercel Authentication reports `all_except_custom_domains`; it is not proof that an uncreated target is protected. Team metadata does not establish effective spend caps or incremental attribution.

Validation project `caynldluziwrzmvuslzg` has no private gate schema, no sessions/MFA factors, no storage buckets or realtime-published tables. The six public fixture functions are invoker contracts; community_posts, community_profiles, saved_legs and notifications are absent. This is a catalog observation, not proof of installed authorization or functional consumer journeys. No schema/account/session changes were made.

## Owner checklist and remaining blockers

Use the exact [environment inventory and isolation checklist](final-staging-acceptance.md#exact-custom-target-variable-inventory-no-secret-values). No additional environment variables or secret values are needed for this application's session bridge. Both endpoints are combined-only extensions, absent from standard/gate/consumer-fixture builds. Missing/malformed staging configuration rejects build/runtime; the new branch is included in missing-profile fail-closed detection. The first published tree disables automatic Vercel Git deployment for that exact branch and adds exact-head CI coverage.

1. **Project owner:** confirm the remaining custom slot is included in the current plan, record effective spend controls and attribution within Mike's conditional $10 incremental Vercel ceiling (#297 comment 6948943185). Approval is conditional, not unlimited or proof of configured isolation. Do not create/configure until those requirements are satisfied.
2. **Project owner/security:** approve and demonstrate the complete isolated target's effective variables, credentials, integrations, no production domains/fallback, outbound/billing/publishing disabled, protection and rollback. Existing inherited Preview settings are not sufficient.
3. **Database owner/security:** independently review the existing prepared isolated fixture installer and RLS drift preflight. Install only after environment approval; snapshot data/policies first. Missing social/profile/notification/desk/download contracts need an isolated supported-contract plan and independent review before feature acceptance. Do not relax preflight to import production-like tables or blanket privileges.
4. **Identity owner/Mike:** map both intended owners to authorized synthetic accounts, confirm MFA and independent recovery custody after isolation. No production account copying, session revocation or entitlement changes.
5. **Codex/Elo:** deploy only the exact reviewed SHA manually to the approved protected target; verify credentials/protection/side-effect isolation before real sessions. Execute both-owner MFA, non-owner/anonymous/expired/revoked access, direct-data and cross-user mutation denial, complete feature journeys, preserved data/worker behavior and rollback. Separate local/synthetic, GitHub browser and real hosted results.

## Tests, rollback and release order

Retain the existing nineteen RLS/catalog drift negative controls and transactional rollback/reinstall tests; no SQL baseline or grants are weakened. Retain the unresolved 15-second UI networkidle smoke timeout (one unchanged rerun passed; cause unproven). No assertion/timeout weakening or warning suppression.

Rollback the isolated app to the recorded previous exact SHA, keeping live-session restrictive RLS installed. Exercise Discovery off separately from the access gate. Confirm expired/revoked sessions stay denied and fresh authorized owner sessions recover; compare historical row hashes/counts and entitlement records before/after. Client sign-out must clear protected UI even when the backend is unavailable, without claiming server revocation succeeded. Hosted rollback is not yet tested.

Sequence: exact-head code/CI and Elo independent consumer/security review → owner cost/isolation proof → reviewed isolated DB preparation and supported missing-feature contracts → protected deployment → real-session feature/security/data/worker/rollback acceptance → consolidated exact-SHA CEO review. Production needs a separate exact-candidate go/no-go. No production merge, deployment, database migration, accounts, billing or publishing schedules were changed.
