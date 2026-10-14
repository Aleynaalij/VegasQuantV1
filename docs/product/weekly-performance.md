# Weekly platform performance

Records contains immutable weekly Lessons Learned snapshots, with a separate swipe card stream for hits, misses, pushes/voids and pending targets. Every downloadable page is watermarked VegasQuant by the existing phone-card exporter.

The recurring weekly publication is enabled for Tuesday mornings in America/New_York, starting October 20, 2026. The scheduled publishing task calls `public.publish_weekly_performance(null)` via the authorized Supabase connector and reads back the hosted row. It is a publication task, not a reminder. The window is the previous Tuesday 00:00 through this Tuesday 00:00 Eastern, including Monday night games by kickoff. DST uses the IANA timezone.

Only explicitly classified non-experimental qualitative individual selections enter the audit. Original game IDs or immutable tracking contracts bind selections to game kickoffs. Exact duplicate targets within the same game and market/period count once; different thresholds or periods remain distinct. Hail Mary, retrospective tickets, unclassified releases and watchlists are outside this individual-selection performance measure. Unresolved game identities are counted as coverage gaps, not guesses or losses.

A sourced outcome must be WIN/LOSS/PUSH/VOID. Conflicting verification puts the target pending. Win rate is wins/(wins+losses); pushes, voids, pending and unbound publications do not enter that denominator. The UI prominently labels incomplete coverage and the verified-subset rate. It is not parlay performance, ROI, betting profit or a full platform hit rate when gaps remain.

The supplied older 36-hit/13-miss image is a historical audit reference, not an imported machine-verification source. The first snapshot, created October 14 for October 6–12, contains 14 verified unique hits, zero verified misses, four removed duplicate publications, 27 unresolved publications and 34 excluded publications. These totals are incomplete and do not replace or disprove the historical image's wider manual review.

Same-week unchanged payloads dedupe. Later source verification creates an additional immutable version; the UI defaults to the latest version for each week. Earlier snapshots remain stored for audit. Creation time is actual publication time, never backdated to Tuesday. No bankroll or official challenge records are modified.

Tests: duplicate counting, source requirements, pushes outside losses, unbound/excluded gaps, conflict reversion, immutable version history and member write denial. Scheduled writes depend on connector availability; failures must be reported without claiming publication.
