# NHL expanded matchup report

The owner approved last-five team/player form, matchup scoring context, opposing-goalie GAA and first power-play units, using NHL.com and RotoWire. This is research context; it does not change models, odds collection, recommendations, publishing or the paused simulator.

## Sources and calculations

- Official NHL schedules bind the exact away/home pair, regular-season type, season and scheduled start (15-minute tolerance). Select the last five completed games before the target matchup; exclude preseason, future, cancelled and non-final games.
- Team form shows W–L–OTL and goals for/against per game in that window. Remove the shootout deciding point from scoring rates, while retaining the official game outcome.
- Goals/points leaders use the same team-game window. Every selected player box score must match the NHL game, season and teams; reconcile player goals and both team scores. Missing or conflicting boxes suppress player rankings. Fewer than five available games are labeled with the actual sample.
- RotoWire's dated public lineup page must match its displayed calendar date and exact away/home pair. Goalie confirmation is source-reported and timestamped. PP1 remains **projected**, independently of goalie status; require exactly five PP1 players and exclude PP2. No paywall, bot challenge or access restriction is bypassed; unavailable sources remain unavailable.
- Match a listed goalie to one official roster identity, then use that player's NHL regular-season appearance log. GAA is `3600 × goals against / actual seconds played`, over up to five prior appearances. Exclude unused goalies and the target game date. A missing goals-against or TOI value suppresses GAA, rather than becoming zero.

## Delivery and privacy

The NHL report mounts only when a Home game row opens, or on an NHL matchup page. Reads use saved data, not browser-to-provider requests; closed rows make no context reads. The existing lightweight Home payload and best-price feature are preserved. Account switches clear report state, errors can retry, and delayed responses cannot restore a previous account's data.

The source cache, progress leases and reports are private with RLS/default-deny and no direct member or service_role table grants. Source/work/write RPCs grant EXECUTE only to service_role. The member read RPC checks existing membership and age gates. Personal favorite input is returned only to its verified author, and matched to a unique roster identity; other members receive no private watchlist. No private feedback is posted to GitHub or The Zone.

`nhl-context` is an isolated Edge Function with the existing feed-token authorization. It does not replace `sports-sync` (whose hosted version differs from current source). Each run leases at most two upcoming games within 36 hours, uses bounded provider concurrency, and caches free source reads. A dedicated ten-minute database cron refreshes this research context only. Existing odds/API-credit settings and publication jobs remain untouched. Cache rows expire, with unused expired entries removed after 14 days; report source hashes/timestamps remain for provenance, without claiming an immutable raw-source archive.

## Release checks

Parser/calculation tests cover source binding, incomplete/conflicting data, shootouts, weighted GAA, actual zeros, projected PP1, and ambiguous favorite names. SQL tests cover private grants, URL allowlisting/checksums, bounded nonduplicate work leases, report binding and age/member/favorite isolation. Browser tests at 390/1280px cover lazy loading, expanded and full-game reports, source gaps, private favorites, valid zero, mismatched response refusal, retry and layout.

Apply the context migration, deploy only the new Edge Function, then apply its schedule migration. Trigger the existing authorized feed-token call and verify saved real reports, source completeness and the actual cron/Edge version. Missing data must be reported precisely; a passing fixture or successful deployment alone is not evidence of real source coverage.
