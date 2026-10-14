# Unified research and Community

Navigation: Home / The Zone / Community / Records / Account. NFL and NBA remain separate sport desks. Existing matchup URLs still work as the Games view within The Zone.

The Zone provides Latest, Games, Legs and Injury Watch views; extra research filters are collapsed. Game notebooks open with available factual summaries before deeper categories. Home, Zone and the welcome guide explain where to go. Existing membership gates remain in place.

Community provides text-based My slip, Game talk and Result posts, optional shared stake, comments, helpful reactions, follows and a Following feed. A completed visible community profile is required to publish or comment. Result posts are explicitly member-reported and unverified. Profile usernames are snapshotted when a member voluntarily publishes; body text and selections render as escaped text. Sharing never records a wager or changes bankroll/results. NBA only allows discussion during preparation, enforced by a database constraint.

Authors can remove their own posts/comments; admins can moderate. Members can report posts, and admins see reports in Community. Posts cannot be rewritten through the Data API. Publication rate limits are enforced server-side (30 seconds for posts, 10 for comments). Five new tables have RLS and explicit grants; anonymous users cannot read member content. Follow relationships are readable only by their owner; reports by their owner or admins. The feed RPC is security invoker and honors RLS.

Verification: run `npm run typecheck`, `npm test`, and `npm run build`. `tests/sql/community-social-feed.sql` validates member publishing, author identity, count aggregation, rate limits, follows, reports, ownership, anonymous denial and the NBA gate in a transaction that rolls all fixtures back. It requires existing completed profiles and privileged SQL test access. No seeded public posts or invented conversations.

No automated grading, result verification, image uploads, direct messaging or notifications to other members are introduced by this release.
