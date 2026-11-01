# Live game day

Owner request (Oct 31, 2026): a live game-day experience. Three parts, all for NBA, NHL and
college basketball picks; NFL shows live scores only (its published legs are free-text props, so they need a separate mapping).

## 1. Live now strip (#181)
- Every sport's Home shows games in progress (score, period and clock), then today's finals, each
  linked to its matchup. Hidden when nothing is live or the feed is down.
- `/api/live?sport=` reads ESPN's public scoreboard for yesterday and today (ET), cached 20 s.

## 2. Your pick is sweating (#182)
- Each published pick on a live or just-final game shows where it stands: moneyline
  leading/trailing, spread covering/short, total needs N or N to spare, player props against
  the live box score.
- `/api/live/box?sport=nba|nhl&id=` reads ESPN's summary with the graders' own columns (NBA
  points/rebounds; NHL skater goals/assists, goalies excluded) and reports whether ESPN marks
  the box final.
- A box counts only while fresh: a failed refresh drops it, and a final game's props use only
  a box ESPN itself marks final. A player with no stat row is never guessed.

## 3. Live alerts
- One alert per pick, when it is decided: an Over clears or a scorer scores (mid-game), or the
  game goes final. Wording says "cleared"/"final", never "won": the record is still settled by
  the graders, and the alert says "Official result after grading".
- Recipients: age-eligible admins and active members/subscribers only, through the existing
  notification emitter. That means in-app plus push, member preferences (new type `pick`,
  "Live pick updates", switchable), quiet hours and per-recipient dedup. High priority: pushes
  within seconds.
- Lock screens never show the pick: the push reads "One of our picks on a live game was just
  decided" and opens the matchup page.
- `private.invoke_live_pick_alerts()` runs every 2 minutes (pg_cron) and calls
  `/api/live/alerts` (dispatch secret) only while picks on started games remain unalerted.
  `public.live_pick_alert` validates the pick, sport and link, and fans out once
  (`private.live_pick_alerts`).

## Checks
- Unit: `tests/live-scores.test.ts`, `tests/live-sweat.test.ts`, `tests/live-alerts.test.ts`.
- SQL: `node tests/sql/live-pick-alerts.mjs`.
- Browser: `scripts/ui-smoke/live-now.mjs` (CI runs with `LIVE_SCORES_DISABLED=1` so real
  games never change other checks).
