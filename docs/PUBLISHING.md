# Analyst → site publishing contract

Vegas Quant Ultra and the owner are the sole source of analysis and official decisions. Publishing is authorized only after the owner labels a handoff official. Never research or fabricate a missing betting input during publication.

## Through the phone admin

1. Sign in at `/membership` with an approved account, verify the authenticator code, then open `/admin`.
2. Select the game and publish a timestamped **analysis version**. Paste the original handoff verbatim. Copy only supplied content into the named sections and projections.
3. Publish current/opening market snapshots with their actual observation time and source.
4. When expressly approved, choose **Official pick**, select its source analysis and challenge stage, and enter the supplied values. The screen previews the exact publication payload before confirmation.
5. Confirm **Actual bet entry** separately, including the actual number, price, and bet time. An analyst recommendation is not proof of execution. The published stake must match the confirmed stake; if it does not, stop and ask the owner before proceeding.
6. Record closing number/odds after kickoff using the same selection and the pre-kickoff close observation time. This is manual/owner-supplied; no sportsbook feed is connected.
7. Enter the sportsbook result and final score. Bankroll profit is calculated from the actual odds, once.
8. Add a process grade, result classification, and lessons. Updated reviews create new records.

A pass uses **Pause / pass**, recording the reason and preserving capital. Resume explicitly selects the current or later stage. It does not create a wager. One official play is permitted per stage.

## Required official fields

Game; source analysis version; stage or standalone; market; selection; recommended numeric line (except moneyline); over/under direction for totals and props; odds; stake; model probability; market probability; edge; confidence; risk; predicted close; best number; bet grade; Fear Index; timing; why-like; why-lose; playable number; pass number; sportsbook; original handoff.

If the Work-chat package omits a required field, ask for it. Examples in the product specification are **not** authorization to publish those example values. The stated edge is stored exactly; it must be ≥3. Probabilities use a 0–100 scale. Money uses integer cents in the database.

## Work-chat operations

The connected Supabase management tool can read the normalized tables and execute an approved publication transaction. Normal app publishing calls `public.publish(action, payload, request_id)` as an approved Auth administrator. Do not invent an administrator identity or bypass the allowlist. If no approved admin session is available, a trusted database operator can apply an explicitly authorized owner handoff with a reviewed transaction, preserving all validations and immutable audit records. Always verify the member view after publishing, and confirm protected details do not appear in the public response.

No autonomous odds, injury, weather, close, or result feed is configured. Closing-line capture is not scheduled unless explicitly requested and an authorized data source is supplied.

## Maintenance

- Never update/delete published analysis, recommendation, entry, closing, result, or bankroll records.
- Append a new analysis or process review when the reasoning evolves.
- Financial corrections require a separately designed compensating transaction and explicit owner instruction; the initial release intentionally does not silently rewrite settled money.
- Do not expose administrator identities or private receipt data through public views.
- Use the member ledger CSV export for review; full relational history lives in Supabase and should be included in the owner's database backups.
