# Seven-day identity windows — interval-only review

**PROPOSED / NOT EXECUTED.** Generated from the approved post-free-Home identity artifact `ee6f722f496e8dc132e3206d50ecb8a0052ad02ead30c3d24b0fb2d96da7fba7` under [Claude's latest sign-off and window recommendation](https://github.com/Aleynaalij/VegasQuantV1/issues/294#issuecomment-7007496575).

New SQL SHA256: **`4cfc305211e5c5153c58bf0e37097f5f720f897dcf0464136fac072d8565f564`**.

Only five future interval constants change:

| Control | Change |
|---|---|
| active-verified | expiry +24 hours → +7 days |
| entitled-unverified | expiry +24 hours → +7 days |
| revoked-verified | expiry +24 hours → +7 days; revocation unchanged |
| not-started-verified | start +1 hour → +7 days; expiry +24 hours → +14 days |

The not-started identity therefore has a full seven-day eligible window after its seven-day future start, rather than identical start/expiry bounds. All past bounds, expired/unentitled states, UUIDs, metadata, gate/ACL logic, original-column digests, single-use checks and I1 sequencing remain unchanged. The withdrawn old identities.sql is never a hosted execution candidate.

`atlas-identity-seven-day.mjs` regenerates the exact bytes from the approved source. Native rehearsal first runs the unchanged approved preparation/free-Home tests, then the new SQL in a fresh disposable loopback cluster. It confirms the exact seven-/fourteen-day bounds, **33/33 catalog checks**, all original preservation digests, and **zero sessions**. Two focused tests and TypeScript pass. No hosted identities, credentials or MFA have been created.

Claude must approve this new hash before execution. I1 still requires the post-free-Home catalog check, protected deployment probes and execution immediately before negative-control/journey tests. Window widening does not authorize earlier provisioning or real sessions.
