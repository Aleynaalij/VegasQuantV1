# ATLAS free-user Home — separate option (b) proposal

**UNREVIEWED / NOT EXECUTED ON HOSTED STAGING.** Owner chose [option (b)](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7000004327): add synthetic fixture `games.slot/created_at` and restore the original free Home branch. The already-approved preparation was executed separately; see [E1](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7000155916).

| Separate artifact requiring Claude's new hash sign-off | SHA256 |
|---|---|
| `free-home.sql` | `5648c29322e888e45c4048a223e5cf1b6b9de13c9cc11f6892b818cfa2d450e2` |
| `identities-after-free-home.sql` | `ee6f722f496e8dc132e3206d50ecb8a0052ad02ead30c3d24b0fb2d96da7fba7` |

Both target **only `caynldluziwrzmvuslzg`**. No production write, deployment, hosted free-Home execution, identity creation or session occurred in this proposal. The approved preparation/identity files and all prior sealed package bytes remain unchanged. An old approval does not cover these two new hashes.

## Generated change and access boundary

`atlas-free-home-prepare.mjs` derives the original column types and function definitions from the pinned native replay catalog. One transaction asserts the reviewed prepared state: four original users, zero sessions/allowlists, expected existing function hashes, absent columns/helper, and all catalog checks. It locks the fixture table, adds **nullable `slot text` and `created_at timestamptz` with no defaults**, and never updates any existing field. New fields remain NULL. Existing games/archive OIDs and original-column digests remain unchanged.

The original `private.free_challenge_desk()` definition is restored **byte-identical** to replay. Direct execution is then revoked from PUBLIC, anon, authenticated and service_role. This is necessary: its original SECURITY DEFINER body bypasses table RLS and contains no private-stage gate. Simply restoring its old authenticated EXECUTE would expose a path around the gate.

The small associated call-site adaptation is explicit for Claude's review:

- Add `vq_private_access_stage.free_challenge_desk()`, a postgres-owned, empty-search-path definer. It checks the **live private gate AND stored verified age**, then invokes the internal original free function. It deliberately does not require a paid entitlement. Only authenticated receives EXECUTE; anonymous is denied, and unauthorised/expired-gate or unverified callers get `42501`.
- In each original SQL **SECURITY INVOKER** function `public.desk_data()` and `public.desk_data_compact()`, replace exactly one free-branch callee (`private.free_challenge_desk()`) with the guarded namespaced callee. Nothing else in the original definitions changes. In particular the paid branch remains invoker/RLS-bound; the whole paid query is not converted to a definer.

The manifest records both source/proposed hashes and complete SQL for the two call-site adaptations, original free-source hash, gate-wrapper hash, source column metadata and preservation projection. Postconditions assert the source free-definition hash, internal-only ACL, invoker paid functions, unchanged OIDs, NULL new fields, all 33 catalog rows and standalone outbound/ACL assertions. Any drift rolls back.

This is a security-preserving proposal for the owner's chosen free path, not a claim that HTTP/UI parity or all aggregate capability groups are accepted. The new public function hashes and extra gate helper require actual catalog recapture/review after execution. The staged registry must respect the paid/free split and must not force capabilities or replace production hashes with fresh exports.

## Original-column preservation and I1 dependency

`catalog-assertions-after-free-home.sql` is the unchanged Claude query except that the single `public.games` digest input becomes an explicit ordered ROW of its **original 11 columns**. It preserves the original baseline `0d4f96e41536c949ef4d95a5b4f5c6a5`; no expected original digest is changed. Whole-row serialization changes because two nullable columns are added, which is expected and cannot be used to pretend original data changed or disappeared.

The currently approved `identities.sql` (`dcbc7c45…`) embeds that old whole-row games query twice. It therefore correctly **rejects after this schema change**. This is demonstrated in rehearsal, with zero identities left by the rejected transaction.

`identities-after-free-home.sql` is generated from the byte-verified approved identity file by replacing **only those two embedded digest queries** with the same original-column projection. All six UUIDs, fixture states, metadata, ACLs, gate allowlisting, single-use checks and time bounds stay byte-identical otherwise. It needs Claude's separate sign-off on its new hash. The old approved file is not edited and must not be executed against the new schema.

**I1 still applies:** run the reviewed identity artifact only after actual target-catalog sign-off and deployment probes, right before negative-control/member tests. The active entitlement lasts 24 hours; the not-started control becomes active after one hour, so execute immediately before tests (within that shorter window for that case). If the test schedule slips, regenerate/review the time-window change rather than editing existing identities or reusing an earlier approval. No identities are created now.

## Native rehearsal

`atlas-free-home-rehearsal.sh` starts a fresh disposable fixed-loopback PostgreSQL cluster with no remote connection options. It first runs the **unchanged approved preparation/identity rehearsal**, then reproduces the current four-user/zero-session staged state using only local synthetic fixtures. No original approved source or hosted database is modified by the harness.

`rehearsal.json` is PASS and binds both proposed SQL hashes:

- Full free-Home transaction rollback restores absent columns, old denial/callsites/ACLs and original relation OIDs.
- The original free function is restored byte-identically but is internal-only; both public desk surfaces stay SECURITY INVOKER.
- **33/33 catalog checks and 10/10 original preservation digests PASS** after adding columns and after the revised identity process.
- A gate-authorized, verified, unentitled control receives `free_core:true`, `access.allowed:false` and the original synthetic game. Output equals the original replayed free function's output exactly; new fields are NULL, with no fabricated content.
- For **both** desk RPCs, paid output matches its pre-change output exactly after removing only the two intentionally added nullable game fields. Paid membership remains allowed and paid queries remain invoker/RLS-bound.
- Expired-gate, unverified-age and anonymous calls deny. Synthetic sessions used to exercise the gate are local only and rolled back.
- The old approved identity check rejects; the projection-only identity revision succeeds. No identity/permission/window changes are hidden in that revision.

These are native SQL/gate tests, not real Supabase MFA, protected HTTP/UI acceptance or Elo's journeys. Hosted execution is UNRUN pending both exact-hash reviews.

Reproduce with the same pinned portable PostgreSQL/pg driver used by the approved package:

```sh
node scripts/operations/atlas-free-home-prepare.mjs --out /tmp/atlas-free-generated
ATLAS_REPLAY_PG_BIN=/tmp/atlas-native/node_modules/@embedded-postgres/linux-x64/native/bin \
ATLAS_REPLAY_PG_MODULE=/tmp/atlas-native/node_modules/pg/lib/index.js \
bash scripts/operations/atlas-free-home-rehearsal.sh /tmp/atlas-free-rehearsal
node --import tsx --test tests/atlas-free-home.test.ts
npm run typecheck
```

After Claude approves this patch hash: independently pin staging, execute the exact bytes, rerun the projection-aware catalog assertions and production metadata invariants, recapture actual catalogs/ACLs, and request the updated target-catalog sign-off. Deployment probes and I1 identity execution remain subsequent gates. Production remains **NO-GO**.
