# NHL and college odds refresh cadence

`supabase/functions/sports-sync` refreshes FanDuel lines (plus the other five books from the same
response) for NHL and men's college basketball. Each refresh costs 2 Odds API credits. The database
function `sports_reserve_credits` caps each sport per America/New_York day: **150 for NHL, 50 for
college**. Failed paid requests still consume their reservation. These caps, costs and the reservation
function are unchanged by the cadence rule below; `cadence.ts` only decides *when* to spend.

## The rule (`cadence.ts`, since PR #197)

1. Only games a book has priced count: a game with any `sports_markets` row in the last 36 hours.
   Listed games that never get odds (early tournament slots, placeholders) do not drive refreshes.
2. Find the latest priced tip-off before the next New York midnight. `latestPriced()` probes tip slots
   from the last one back, one row per probe of up to 100 game ids, so no result-size limit can hide a
   priced game.
3. Refreshes left today = `floor((cap − reserved today) / 2) − 1`. One is kept in hand for a late move.
4. Interval = time until that last priced tip ÷ refreshes left, clamped to **25 min .. 3 h**.
5. No priced game left today: **3 h** (discovery cadence, so newly posted lines are still found).
6. If the market lookup itself fails, pace against every game listed today instead and log
   `cadence: …`. The refresh is never skipped because of the lookup, and the budget still holds.

## The tradeoff

Freshness and coverage pull against each other under a fixed budget.

- **Old rule** (25 min whenever any game tipped within 6 h): very fresh in the morning, then out of
  credits. On Nov 2 the college cap ran out around noon ET, so the 7–11 PM slate had no current price.
- **New rule**: even spacing to the last priced tip. On a full college day that is about one refresh an
  hour, so a price can be up to an hour old, but every game up to the last tip keeps a recent price.
  NHL's larger budget usually sits at the 25-minute floor, as before.

A FanDuel quote is only *selectable* for a pick while it is under 30 minutes old (`expires_at` in
`normalize.ts`). Hourly college refreshes therefore mean a pick may need to wait for the next refresh;
the cadence trades a shorter selectable window per hour for coverage of the whole day.

## What the tests show, and what they do not

`tests/sports-cadence.test.ts` covers the pacing rule. It checks the caps against the SQL, empty and
stale reads, a failed lookup, zero or one refresh left, ET resets and both DST switch days, a game
priced later in the day, and that the cap is never exceeded. It also replays the real Nov 2 college
slate (fixture in `tests/fixtures/sports/ncaab/2026-11-02-tips.json`): the old rule's last refresh is
10:24 AM ET, the new rule refreshes about hourly to 9:34 PM ET.

That replay is a model of the scheduling rule, not live coverage. It does not show future provider
behaviour, line posting times or the live function's actual run times. Live behaviour is confirmed from
`private.sports_feed_settings.last_lines_at` and `feed_runs` after deployment.
