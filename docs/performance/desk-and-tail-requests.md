# Home/Records request bounds and tail batching

Home and Records refresh through `desk_data_compact`. It retains the existing desk membership/RLS projection, but caps market snapshots at the newest 200 and audit events at the newest 100. Financial records, picks, results and analysis versions are not truncated. The original `desk_data` remains available for complete game timelines and audit consumers. No stored history is deleted. Anonymous/free desk responses retain the existing public projection.

`leg_tail_counts(text[])` aggregates up to 150 unique requested leg keys per request, returns zero for missing keys, and never returns user identities. It preserves the single-count endpoint's authentication and age guards. The shared card loader coalesces visible cards, caches for two minutes, and retains existing mutation invalidation. A batch larger than 150 is chunked by the shared loader. Errors are propagated rather than cached as false zeroes.

Deployment verification: the existing 814 audit rows serialized to 2,784,825 bytes; the newest 100 serialized to 823,828 bytes (uncompressed JSON audit field only). This is not a measurement of total page download or browser latency. The free desk already omits these arrays, so this reduction applies to member desk responses. PostgreSQL fixture verifies row bounds/order, full endpoint retention, unchanged result projection, duplicate/missing keys, batch bounds, authentication, age checks and anonymous permissions.

The per-page Shell/tab bar is still mounted per route. Moving it to a persistent shared layout remains separate work; these changes do not claim to fix every source of navigation latency. Research board, official selection gates and record classifications are unchanged.
