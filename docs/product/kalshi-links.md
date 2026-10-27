# Open published selections on Kalshi

Cards and saved member parlays offer **Find on Kalshi** below Gambly. Lookup is read-only and on demand; no Kalshi account, trading key, order submission or price conversion is involved. Users confirm eligibility before opening external links.

The authenticated `/api/kalshi` route reads selection snapshots from `published_legs` or immutable `nfl_analyst_double_ups` snapshots and the authoritative `games` row. It never trusts client-supplied player, target or matchup data. Currently supported: upcoming NFL full-game integer N+ passing yards, receiving yards, rushing yards and receptions. Other markets, closed/graded selections, started games and unverified context produce no match.

For each game/stat, query Kalshi's public market endpoint using its exact event ticker. Match binary active status, open/close times, exact player/stat/target title, primary resolution text and the greater-than N−0.5 strike. Do not substitute a nearby line, ladder/escalator, different date or another player. The view link targets the exact event and carries only `op_market_ticker`; no order parameters. External market snapshots are cached for 60 seconds. No Kalshi prices or VQ edge/approval claims are displayed.

Saved parlays check individual legs in batches of 25 without capping ticket size. Matching markets open individually; this is not an automatic Kalshi combo or a claim of combined availability. Missing matches and provider failures have distinct UI states. Publishing, research exemptions, selection gates, bankrolls and records are unchanged.

References:
- https://docs.kalshi.com/getting_started/quick_start_market_data
- https://docs.kalshi.com/api-reference/market/get-markets
- https://help.kalshi.com/en/articles/17516391-ladder-and-escalator-markets

Validation: `node --import tsx --test tests/kalshi*.test.ts`; production build; mobile/desktop dialog smoke checks. Live authenticated member lookup needs the member's valid session; test fixtures do not establish coverage for every published target.

All shared Gambly ticket actions expose a second Kalshi button. Screenshot-only and other unmapped contributor tickets offer explicitly labeled browsing after eligibility confirmation; they do not claim an exact market or copy/recreate a slip. Analyst ticket keys resolve server-side by ticket ID and candidate index, retaining expiry and authoritative game checks.

Typed legs (contributor lays and other tickets without published keys) also cover other player props: points, rebounds, assists, threes, anytime and passing touchdowns, shots on goal, goals, hits, strikeouts and home runs ("Name N+ stat" or "Name anytime TD"). Their series come from Kalshi's sports catalog (`/series?category=Sports`, cached for an hour): a KXNFL/KXNBA/KXWNBA/KXNHL/KXMLB series whose ticker code or title names the stat. A market links only when it is an open binary "N+" market whose title starts with that player and target and names the stat, whose rules name the player, which closes within four days, and which is the only such market. A catalog or market fetch failure shows as unavailable, never as a guess. These series names were not verified from a live Kalshi response in development; an unmatched name yields no link.

Opening Kalshi from a ticket with typed legs copies them to the clipboard. Kalshi does not accept a ready-made ticket, so members open each matched market or paste a leg into Kalshi's search.
