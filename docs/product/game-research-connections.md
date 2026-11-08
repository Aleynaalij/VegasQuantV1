# Game research connections

## Scope

- NFL matchup destinations now reuse Home's published player prop table, including existing portraits, recorded recent form, exact lines, rationale, risks and actions. Verified player research loads independently of the written analyst briefing. Current props do not appear within a selected historical analysis version. Empty/expired publications link to the historical game ledger. Reads refresh every minute and on focus, with account-change invalidation.
- NBA Home expanded cards keep starting lineups and reuse the matchup page's source research (observed book prices, injuries, recorded player form). Research remains separate from editorial selections. Source research requires verified membership and is remounted across account changes. A failed quote query no longer hides a successful editorial-pick query; retry is actionable.
- NHL and NCAAB already reuse SportMarkets on desk cards and individual matchups. NHL also reuses NhlGameReport. Both retain published selections and independently display sourced markets. Last-known individual prices now carry an explicit timestamp/stale label.
- NCAAB remains moneyline/spread only. No independent NCAAB probability model or edge is added. Market-implied chances and price comparisons are not model edge.

## Data boundaries

No source data, ingestion schedule, provider budget, model, publication gate, official selection, result, or production deployment is changed. Missing sources remain missing. Historical form is not model probability. NBA forecasts are not promoted to editorial picks. Existing sports display RPCs already retain expired latest snapshots for labelled display; publication and Slots keep freshness checks.

## Acceptance checklist

Before merge, verify with an authorized member session at phone and desktop widths:

1. Open NFL matchup with published props but no written briefing: table is already expanded, correct game only, and its actions work.
2. Fail the analyst query independently: available player props still load; analyst error has Retry.
3. Open/close multiple games, follow research links and Back, refresh/focus, switch accounts/sign out. No previous-account protected rows remain.
4. Expire a prop or settle it: it disappears from active table; original publication remains reachable in history. Select historical analysis: no current prop table is injected into that snapshot.
5. NBA expanded card shows one starting-lineup block and source research together. Open player form; confirm observed dates, recorded values and source links. Empty editorial list must not suppress source research.
6. Fail NBA odds/picks independently, retry, and switch accounts while reads are pending. Only successful authorized sections render.
7. NHL/NCAAB desk and matchup show the same game-scoped sources. Old prices explicitly say last-known and retain timestamp. NCAAB does not claim an independent model edge or add player props.

Automated connection tests assert component wiring, auth/expiry boundaries and existing multisport reuse; they are not a substitute for runtime UI acceptance.
