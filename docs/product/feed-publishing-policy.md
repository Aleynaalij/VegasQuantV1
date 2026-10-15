# Feed and Pick of the Day

Owner policy, October 10, 2026:

- Feed publishes concise individual "Legs we like" cards, with one supported selection per upcoming game where possible.
- Sunday noon ET covers 1 PM games, 3 PM covers late-afternoon games, 7 PM covers evening games. Earlier kickoffs require pregame coverage; never backfill.
- Owner update, October 11, 2026: publish defensible player-stat picks even when sportsbook odds are unavailable. Each card must name the player, statistic and specific analyst-selected target/direction, explain the workload/matchup case and loss risks, show source links and include the supported Gambly copy/open link. Clearly distinguish an analyst-selected stat target from a verified sportsbook line. Missing odds alone must not block a supported qualitative stat pick; mark price as unavailable and market availability unknown. Never invent a market, line or price, force a pick, or claim validated EV/edge without priced evidence.
- FanDuel remains the primary sportsbook for NEW priced selections. Verify its exact market, line, price, source URL, retrieval time and provider quote timestamp. If unavailable, keep those fields null and use the unpriced stat-pick presentation above; do not silently substitute another book. Scanner outputs remain WAIT/SHADOW_ONLY when missing inputs; a separately documented qualitative editorial stat pick does not change scanner status or become BETTABLE/OFFICIAL.
- Retrospective winning tickets may use our own design and accurately show the sportsbook on the submitted settled ticket. Preserve the exact combined odds, stake and total payout; distinguish payout (stake included) from net profit. This is a Feed celebration, not a challenge-result or bankroll modification.
- Other books may support clearly attributed comparison and market context, but their line, implied probability, movement, splits or boosts must never be labeled FanDuel. Preserve original published prices and sources, including existing DraftKings tickets. Publish verified FanDuel repricing as a new timestamped update linked to the original; do not recompute an unverified parlay or assume boost eligibility.
- Avoid "not finalized" and "subject to change" boilerplate. Retain actual uncertainty and experimental model labeling in evidence details.
- Home features a single designated Pick of the Day and the owner's Hail Mary of the Day in its separate slot. In immutable candidate releases, mark only the single Pick of the Day with `pick_of_day: true`. Ordinary individual selections remain in Feed; never hide or replace the Hail Mary Home ticket.
- Do not rewrite original selections/history or imply qualitative analysis is a validated probability, edge or official challenge pick.
- Never force a selection to fill a quota; report missing game coverage to the owner.
- Existing official publishing controls, immutable edge releases and no-wager/no-result-change rules remain in effect.

Required community setup: signed-in accounts must have a custom username and uploaded profile photo in the app flow. Generated Member_<id> usernames do not complete setup. Profile visibility choices remain separate from completion; completing setup is not identity verification.

## Worth a dollar of your time · weekly sleeper series

Owner instruction October 14, 2026: a separate entertainment parlay, aiming for 10–12 researched sleeper player-stat targets from distinct games. Do not force the count or assert that a price such as +500 is available. Display no odds or payout. Keep workload evidence, primary source links, downside, final availability and market-availability unknowns in expandable details. Never imply safe returns, validated EV or a numerical confidence without evidence.

Use immutable candidate releases: the first candidate has `parlay:true`, `worth_a_dollar:true`, `analysis_kind:ENTERTAINMENT_SLEEPER_PARLAY`, `parlay_legs`, exact `leg_keys`, and `sweat_until`. Leaf candidates use `analysis_kind:ENTERTAINMENT_SLEEPER`, exact game IDs, targets and source provenance. All candidates have `pick_of_day:false` and `fun_play:false`; this prevents replacing either Home feature. These entertainment leaves are excluded by the existing weekly individual-selection audit eligibility rule. A bundle is one tail, not ten artificial tickets.

`publication_key` is `worth-a-dollar-<season>-week<week>-v1`; dedupe the weekly original. Any material change is a new linked immutable release and never silently moves existing tails. Expire pregame copying/tailing at the earliest included kickoff. `sweat_until` may retain the header link while included games are being played. The green “Let’s Sweat” dot indicates an active series post, not live score/provider health. Respect reduced-motion preferences. Use the supported copy/open Gambly flow; never claim automatic placement or confirmed market availability.
