# Community social feed — October 16, 2026

Home's existing sport-selector row includes a gold divider and horizontally scrollable gold-ring avatars. One entry per visible, confirmed, non-banned member with a post, newest activity first, across NFL and NBA (up to 24 members). These indicate recent posts, not online presence or 24-hour disappearing stories. Private profiles and either direction of a member block are excluded. Signed-out members get a Community link. Refresh on focus, auth changes and every 30 seconds while visible; same-tab publishing/removal also refreshes it.

An avatar links to `/community?sport=…&post=…#post-…`. Exact-post lookup respects RLS and blocks even if the requested post is older than the current feed page. Missing or removed posts get an unavailable message. User IDs/emails are not returned by the avatar query.

Community begins with one optional text field, a Photo attachment and Post. Text-only, photo-only and combined posts use the existing upload sanitization and authorization. Internal legacy required title/body fields are populated without exposing more fields to users. Old slip/title/selection/stake posts remain readable. Existing NBA talk-only policy remains. Likes (existing reactions) and comments are primary actions; report, block, deletion and admin controls live in the three-dot options. The leaderboard and introductory forms are removed from this page; no moderation enforcement is removed.

Verification: existing app suite, TypeScript, PGlite regression for latest-author deduplication, cross-sport deep links, private/banned filtering, both directions of blocking, exact-post counts and anonymous denial; mobile/desktop browser checks with stub data.
