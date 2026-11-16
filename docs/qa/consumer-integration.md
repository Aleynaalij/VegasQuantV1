# Home + Zone integration candidate

The same Home2 and Zone2 components mount at `/` and `/community`, not redirects to old pages. `CONSUMER_UI_ENABLED=true` selects the replacement only when the existing isolated discovery environment gate also passes. Both flags, the matched non-production Supabase project and a publishable key are required. Production Vercel environments are explicitly excluded. This switch is presentation selection, not authentication or permission.

Direct QA routes `/staging/discovery/home` and `/staging/discovery/zone` mount the same components. Rooms use stable `/staging/discovery/rooms/[sport]/[id]?date=...` identities. Existing auth readers, social mutations, RLS and deep-link contracts remain authoritative.

## Rollback
Set only `CONSUMER_UI_ENABLED=false` and restart the same candidate in isolated staging. Root renders VqLobby, Community renders the unchanged default CommunityFeed. No database writes, deletions, migrations, publications, account changes, or stored-content transformation are part of activation/rollback. Turning off STAGING_DISCOVERY_ENABLED also removes all staging routes at the existing proxy boundary. Root `?game` query arrays, `/#home-games`, community post/comment anchors and saved/build redirects remain compatible.

## Acceptance boundaries
The consumer route suite checks candidate activation, legacy fallback, query/hash preservation with intercepted external networking. It does NOT establish a real authorized session, permission parity or a production release pass. Run real-account tests only in verified isolated protected staging; never insert production credentials into this suite. Track-specific functional tests, full unit/type/build and required exact-head hosted CI must pass after combining all tracks. Physical touch, screen reader, performance and full data-contract acceptance remain separate evidence.

Production activation is intentionally not enabled by this candidate. A future separately approved release must integrate the Codex-owned access gate, verify owner recovery/service continuity, and explicitly review the production switch. This is a release blocker, not an implied authorization to activate.

## Explicit remaining blockers
The route suite preserves syntactically valid post/comment IDs in the URL only: it does not prove a target post was loaded or focused, or exercise mutations. Signed-in Home and Game Room account switching/revocation, Zone comments/reactions/follow behavior, and targeted publication focus require separate intercepted session tests and real isolated authenticated acceptance. Existing unit denial tests and the reused reader lifecycle do not substitute for those end-to-end checks.
