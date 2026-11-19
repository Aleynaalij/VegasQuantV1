# ATLAS staging readiness checkpoint

Production remains NO-GO. This checkpoint does not freeze an acceptance candidate.

## Source changes in this checkpoint

- Integrated Elo's six-file consumer patch from #306 comment 6990857654: combined inbox labels describe polling; Game Rooms retain matching sport and global coverage warnings.
- Added value checks to the isolated gate/combined configuration guard. Renamed settings containing the known production project/domain, another Supabase project URL, recognizable privileged Supabase/Stripe credentials, service-role JWT claims or PostgreSQL connection strings are rejected. This is bounded detection, not an exhaustive secret classifier. The effective hosted environment still requires inventory review.
- Standard production configuration selection is unchanged. Branch Git deployment remains disabled.

## Verified infrastructure, without mutation

- Target Supabase project: `caynldluziwrzmvuslzg`. Zero sessions. No gate schema. Twenty registry tables and thirty registry RPCs are absent. Existing reduced-fixture `published_legs` is a table; the original consumer view contract still needs reconciliation without losing records.
- The feature installer requires a separately reviewed, target-specific original-security catalog. Neither the branch nor the referenced #294/#306 comments supply that expanded catalog artifact. Baseline row hashes describe data preservation; they do not review policies, function bodies, dependencies or grants. Do not substitute a fresh export or the test-only PGlite catalog.
- Vercel project `prj_nOLCSmAPzjc5jayXwJ2gJNYXIT9P`, team `team_si4euHcFwtESIMr8T7lR9ewt`: zero custom environments, one allowed slot; project SSO protection is `all_except_custom_domains`. No project connector connections. Team integrations Resend and Stripe both report `projects: []` and selected-project scope. No custom target exists whose effective variables/protection can yet be verified.
- No SQL installation, environment creation, deployment, real member session, production operation or incremental hosted spend occurred.

## RLS-off boundary

The current managed-table inventory and publishable-key REST probes are recorded in #306 comment 6997458839. Auth/realtime/vault/migration schema profiles were refused with PGRST106. In particular, `realtime.subscription` does grant SELECT to anon/authenticated despite RLS being off; the current REST schema boundary is the observed denial, not a missing table grant. All current public/vq_fixture tables have RLS on. The separate privileged-operator public-table RLS-disable counterexample remains unresolved and requires Devon review and Mike's decision.

## Acceptance work still required

1. Complete the session-bound data-access work, including the main-versus-candidate NBA Prop Finder dependency identified in #306 comment 6992903158. This checkpoint does not add that route, reader contract or parity evidence.
2. Prepare and independently review the original consumer schema/dependencies on the isolated target, preserve the reduced fixture, and supply the reviewed catalog artifact before running the supplemental installer. Record generated SQL/catalog hashes and created-object output.
3. Freeze the resulting source SHA after fresh applicable CI/browser checks. Create the custom target without inherited variables, verify effective environment names and values privately, and deploy combined mode with Vercel Authentication, no production target/custom domain, inside the owner's incremental $10 authorization.
4. Post exact SHA, deployment ID/URL, installed-object output and environment names on #294. Claude's isolation probes and rollback rehearsal precede real sessions; Elo independently verifies the same-SHA member journeys.

The required build/profile/discovery controls in `private-access-stage-config.ts` must be included when assembling the combined configuration. Supplying only the URL, publishable key and disabled-provider flags is insufficient to select combined mode. Do not weaken the guard to make an incomplete deployment build.
