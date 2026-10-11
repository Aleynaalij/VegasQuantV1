# Community engagement release

- Save leg: durable private bookmarks of immutable candidate release+ordinal or official pick IDs. `/saved` shows the original selection. Tailing is a separate removable community signal and never writes bet entries or bankrolls.
- Game rooms: `/sweat/<game UUID>` and the bottom of matchup analysis. Signed-in read access; completed visible profiles can post. Posts capped at 1,000 characters and one per ten seconds. Authors delete their own posts; MFA-authorized admins can remove posts.
- Price age: quote observation time, not publication time. Unknown, invalid and future times remain unverified; 30 minutes marks a historical snapshot. Age is not proof of an executable price.
- Follows: Account supports NFL teams and named players, and all versus followed-only publication alerts. Team matching uses the stored game's teams/codes. Player matching requires the player's name in the update. App announcements/health notices are separate.
- Records: all immutable publication snapshots, including singles, Pick of the Day, Hail Mary and official picks. Results are displayed only from stored sourced records. No results were created or changed by this release. No synthetic odds, ROI, win rates, or backfilled grades.
- Activation: `/admin/engagement` requires owner MFA. Current-state milestone adoption is shown separately from new server-recorded first completion events. Account totals derive from Auth; historical milestone times are not fabricated.
- Update bell: per-account unread state for owner-written app updates. Expanding an update marks it read. No automatic SMS delivery.

Validation: production build, 60 Node tests, rollback-only database tests for ownership/forged IDs/admin-only metrics and follow routing. Notification matcher tested against actual UUID and null game IDs using temporary trigger/table fixtures. No fixture rows or deliveries persisted. Security advisors introduce no new findings.
