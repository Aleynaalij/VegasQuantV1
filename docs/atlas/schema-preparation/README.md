# ATLAS isolated preparation — exact-hash review requested

**AWAITING CLAUDE'S SIGN-OFF. No hosted SQL or identity writes, session creation, environment creation, deployment, spend, or production operation has occurred.** The package at `bf1c08ad734a1f0e6f73d3bb4b07d0b40290dee3` was approved **for preparation**, not execution, by [Claude's C1–C4 review](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6999043447). [Mike's six-identity approval](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-6999067358) is recorded separately. All 26 files sealed in the approved package remain byte-identical.

Application candidate remains `8d6b0446094f234e4ad7b8e6539a59adb1cdeaeb`; preserved base #304 remains `1635d0075c84e4351be48d152225f45dc0bed431`. This revision adds preparation tools and review evidence, with no application/gateway/configuration changes.

## Exact artifacts for review

| Artifact | SHA256 | Action |
|---|---|---|
| `prepare.sql` | `49fbe1f4b52be840685e8c4f271fb6920fab500f011cce07afbcbe9382ebef4d` | One transaction: baseline/DDL/RLS/isolation checks, gate and selected member graph, archive cutover, explicit grants, postconditions. Single-use, no identities or sessions. |
| `identities.sql` | `dcbc7c45a5bbac3bac5e23a1c738ac05c4b978e85f14511f1704ba373e6af197` | Separate process requiring its own review: six approved synthetic Auth rows, age/temporal entitlement fixtures and gate allowlisting. No credential/provider identity, phone, password, MFA, session, admin or contributor creation. |

Target is **only `caynldluziwrzmvuslzg`**. `atlas-schema-preparation-request.mjs` hard-pins the connector `project_id`, refuses another target, requires an exact approved file hash and the verified #294 sign-off link, and returns request arguments without executing or opening a connection. A link string does not establish approval: the executing operator must first read Claude's actual comment and confirm both hash and conditions. No connection string or credential is accepted. The SQL GUC is explicitly an assertion, not connection provenance. Four known original UUIDs, two migration identities, whole-row/projection digests, zero sessions, absent schemas and an unchanged reduced-fixture preflight provide additional rejection checks. Do not execute a modified file under an earlier approval.

## Conditions C1–C4

**C1 — application-only outbound assertions.** `post-preparation-assertions.sql` is generated from the prior proposal with the reviewed schema exclusions (`pg_catalog`, `information_schema`, `extensions`, `vault`, `pgsodium`, `graphql*`, `realtime`, `storage`, `auth`, `supabase_*`, `net`, `cron`, plus temporary/system schemas). It uses `~ '\mnet\.'`, not `LIKE '%net.%'`. Both outbound and Dealer/premium function scans use the application scope. Native tests leave marker-bearing managed `extensions.grant_pg_net_access` and `vault.update_secret` stand-ins present, verify `internet.example` does not match, and reject five forbidden markers in an application function. No outbound extensions, vault rows, storage buckets, Auth triggers or realtime sources are provisioned. Direct anonymous public data privileges and exposed RLS-disabled private stores also reject.

The copied `scripts/operations/atlas-staging-catalog-assertions.sql` is Claude's read-only query from branch `ccr-a76c413a-pumo6p`, Git blob `0d8738666afe9a163dac339fc463916f9a587f26`. Its 33 rows cover 10 original preservation digests plus isolation/prepared checks. The new standalone rejection assertion supplies the stricter word-boundary/body-scope checks; the copied historical query remains unchanged for comparison.

**C2 — explicit function privileges.** The accepted global postgres default PUBLIC EXECUTE revoke and private-schema revoke remain. Every selected function gets explicit authenticated/service_role grants derived from the replayed ACL, excluding PUBLIC/anon; preserved fixture functions are explicitly regranted their intended authenticated/service_role access. The preparation checks the expected grants for **all 133 application/gate/fixture functions**, including the definer-only aliases. `rehearsal.json.grants` records every role outcome. An actual newly created private helper is also tested against the global default. Ordinary public tables keep source RLS/policies plus a restrictive live-gate/age/temporal-entitlement policy. New tables receive no anonymous privileges, and old fixture schedule privileges are explicitly revoked from anon. No permissive replacement TRUE policy is invented.

**C3 — generated from original native replay.** `atlas-schema-preparation-reference.sh/.mjs` runs the unchanged approved 187-migration + 3-baseline replay, then `atlas-schema-preparation-evidence.mjs` extracts final functions, table definitions, constraints, indexes, triggers, policies, ACLs, views and sequence metadata from that disposable database. It captures **no original data or seeds**. `replay-catalog.json.gz` and its SHA are deterministic; a second fresh replay reproduced them byte-for-byte. The offline generator selects the dependency graph, applies the named exclusions and exact adaptations, and writes `prepare.sql`, `inventory.json`, assertions and identity SQL. It never opens a hosted connection or executes the original migration corpus on staging. All six installed adaptations are byte-identical to `adaptations.json.proposed_sha256`. The original final link-aware aliases and both final invoker views are retained; both Kalshi pause triggers remain installed. SQL-body forward references are relaxed only during creation and **all selected SQL-language functions are then revalidated with checks on**.

`inventory.json` lists 93 original source tables, the 4 gate tables, 3 original invoker views, 118 source/adapted functions, the full 133-function expected grant matrix, adaptations and 144 excluded objects/callers. Exclusions are omissions, never callable dispatcher stubs. Table defaults, checks, keys, FKs, indexes and retained triggers/policies are generated from the final source catalog, with source RLS preserved and staged access narrowed explicitly. PostgreSQL identity/generated columns are retained. Automatically created identity sequences have inherited anonymous/default grants explicitly revoked and only the intended insertion roles receive USAGE; rehearsal models Supabase sequence defaults and asserts zero anonymous sequence access. Operator/archive/gate/eligibility SQL is explicit code in the generator, not an opaque dump.

**C4 — separate identity process.** `prepare.sql` contains no Auth/user/session insert. The separately reviewed `identities.sql` allocates the six new UUIDs in `identity-map.json` and inserts only inert synthetic `@vq-fixture.invalid` Auth rows, their approved fixture states and gate owner/entitlement rows. Auth metadata is empty; no privileged app role is assigned. These are **not login-ready identities**: no password or provider identity exists, and no MFA/session is created. No email/SMS is sent. Existing four users and original age/entitlement rows are not updated. Gate entries alone cannot pass without a live AAL2 session. Nullable entitlement bounds preserve original allowed values; preservation uses the original ordered `(user_id,allowed)` projection. A local-only synthetic-session exercise is isolated in a rolled-back transaction; it is not part of either hosted SQL file.

## Deliberate restrictions and remaining compatibility work

Dealer, dispatch/push/email, worker, cron, storage-upload, billing, account-erasure/provider lifecycle and external delivery operations stay unavailable. Original in-app notification operations whose call chain reaches an excluded Dealer/delivery helper are also omitted; no half-copied helper is silently installed. Original admin stores remain empty. There is no registry/capability activation in this artifact. Preparation approval does **not** establish full consumer parity or readiness to use real sessions.

The reduced fixture lacks some original columns. Preserve its data/schema instead of silently adding them:

- `private.zone_game_index` requires NFL abbreviations missing from `public.games`; original Zone enrichment and affected dependent contracts stay unavailable.
- `private.wants_publication` is an excluded delivery-preference helper that requires the same missing abbreviations; live-pick functions also depend on missing provider columns and are excluded.
- `public.nba_defense_vs_position` requires `nba_games.season_type`; that research contract stays unavailable.
- **New explicit adaptation requiring this preparation review:** `private.free_challenge_desk()` now raises `42501` for the anonymous/free-core branch. Its original SQL requires `games.slot/created_at`. Anonymous/free consumer contracts are unavailable on isolated staging. This denies the branch without changing fixture columns, returning synthetic content or relaxing membership. The original final `desk_data_compact()` body is retained. The original/proposed hashes and full proposed denial definition are in `inventory.json.adaptations`.

The staged registry still needs independently reviewed equivalence/alignment for adapted hashes, excluded Dealer dependencies and missing research columns. Aggregate groups must remain unavailable until their dependencies really qualify. Never force activation, replace original hashes with a fresh export, or deploy with an inherited all-green/parity claim. This is preparation for review; full member acceptance remains open.

## RLS-disabled boundary (proposed prepared schema)

Exactly three gate stores have RLS off: `vq_private_access_stage.private_development_settings`, `vq_private_access_stage.private_development_owners`, and `vq_private_access_stage.entitlements`. All revoke table privileges from PUBLIC, anon, authenticated and service_role; the schema grants only the usage needed by authenticated callers. The publishable-key caller roles cannot read or mutate their rows. Postgres-owned, pinned-search-path definer functions expose only the reviewed live-session gate decisions. Every selected original public/private table has RLS on, as does the public gate record table. The native catalog confirms no caller table/column access to the three stores. This uses Mike's staging-only trusted-operator decision; it does not survive arbitrary privileged DDL/RLS changes and does not approve production. The actual target catalog must independently confirm this after authorized installation.

## Local rehearsal and limits

`rehearsal.json` is PASS on native PostgreSQL 17.11. It binds both exact SQL hashes and records:

- All **33** post-preparation catalog checks and **10/10** preserved baseline digests PASS; original `published_legs` table OID/data survive the archive move, and authenticated archive SELECT is revoked.
- Full preparation rollback restores the reduced fixture, OID, absent schemas and grants. Changed fixture content or disabled fixture RLS rejects atomically.
- Six installed adaptation definitions equal the approved hashes. Every selected SQL-language function recompiles after forward references resolve.
- Full 133-function grant matrix; new helper PUBLIC default denial; managed assertion exemptions and application marker rejection.
- Separate six-identity process: original preservation digests remain PASS, zero passwords/phones/sessions or privileged contributor/admin rows.
- All six have the same otherwise-valid local live gate. Active gets one own saved row, one real Ruby-view row and one inbox RPC item; each negative gets zero. Direct target-age helper calls deny `42501`. Session AAL downgrade, expiry and deletion deny the active control; anonymous baseline/table/view/RPC calls deny `42501`. Disposable content and synthetic sessions are rolled back.

Positive-content `published_legs` remains **UNRUN**: its source publication/model gates were not bypassed to manufacture a pass. The original RPC executes against an empty approved source graph, which proves execution only. Full consumer paths, hosted equivalence, real MFA, website isolation, the owner's hosted rollback rehearsal and Elo's independent journeys remain unrun. Minimal managed Auth/storage structures and inert marker functions are local stand-ins; native PostgreSQL is not a complete Supabase clone.

The synthetic-only `reduced-staging-snapshot.json` was captured read-only from the explicitly authorized staging target for faithful local rehearsal. It contains fixture structures, synthetic fixture content, original UUIDs and fixture emails, never credentials, sessions, MFA material or production data.

Reproduce:

```sh
npm install --prefix /tmp/atlas-native --no-audit --no-fund @embedded-postgres/linux-x64@17.11.0-beta.19 pg@8.16.3
ATLAS_REPLAY_PG_BIN=/tmp/atlas-native/node_modules/@embedded-postgres/linux-x64/native/bin \
ATLAS_REPLAY_PG_MODULE=/tmp/atlas-native/node_modules/pg/lib/index.js \
bash scripts/operations/atlas-schema-preparation-reference.sh /tmp/atlas-preparation-reference
# Compare preparation-catalog.json.gz to the committed replay-catalog.json.gz.
node scripts/operations/atlas-schema-prepare.mjs --out /tmp/atlas-generated
ATLAS_REPLAY_PG_BIN=/tmp/atlas-native/node_modules/@embedded-postgres/linux-x64/native/bin \
ATLAS_REPLAY_PG_MODULE=/tmp/atlas-native/node_modules/pg/lib/index.js \
bash scripts/operations/atlas-schema-preparation-rehearsal.sh /tmp/atlas-rehearsal
node --import tsx --test tests/atlas-schema-review.test.ts tests/atlas-schema-preparation.test.ts
npm run typecheck
```

Both native harnesses create a fresh temporary cluster, bind fixed loopback only with Unix sockets disabled, verify the connected server's actual data_directory before creating the disposable database, and delete the cluster on exit. They accept no remote host or connection string. Reference replay and preparation rehearsal run sequentially because they deliberately use the same fixed port.

## Authorized next steps

1. Claude reviews **both** exact SQL hashes, the new free-core denial adaptation, explicit omissions and separate identity process. No hosted writes before that approval.
2. Execute the byte-identical preparation on connector `project_id=caynldluziwrzmvuslzg`; execute the identity artifact only under its own sign-off. Capture created objects, grants, preservation/output and unchanged zero-session isolation.
3. Claude reviews the **actual target** catalog and signs its hashes. Align the registry only through separately reviewed equivalence work; do not accept this local catalog as the target catalog.
4. Create/protect `atlas-private-access` and deploy the final approved SHA in combined mode, within Mike's $10 authorization, to a protected `*.vercel.app` URL with the exact staging allowlist of environment names and no custom domain. Report URL/SHA/env names/integrations on #294.
5. Owner database/website/isolation probes and hosted rollback rehearsal, then Elo's member journeys. Real sessions wait for the prescribed isolation boundary. Production remains **NO-GO** until its own explicit decision.
