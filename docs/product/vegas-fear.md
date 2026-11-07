# Vegas Fear | Market pressure

The draft links to /vegas-fear from the lobby’s Fear Index card, labeled NFL / NBA. The destination checks membership before loading protected observations. The Simulator card stays Coming soon. The historical pick-card Fear field, legacy research wish list and Intelligence records have separate semantics. This view reads existing collector evidence and has no weighted score.

| Input | Coverage and evidence boundary |
| --- | --- |
| NFL schedules and market tape | Canonical games IDs and source_observations from the Odds API collector. Full-game moneyline, spread and total. |
| NBA schedules and market tape | Canonical nba_games IDs and nba_observations. Full-game moneyline, spread, total and supported main player markets when collected. Points, rebounds, assists and threes are configured collector defaults. Combined points/rebounds/assists is supported when actually collected. |
| NHL and college basketball | Unavailable in this draft. |
| Injury context | Dated exact-event collector reports, bounded to the latest 100 returned rows before per-team/player selection. This is partial historical reporting. Missing or undated reports provide no current availability signal. |
| Weather and lineups | Unavailable for comparison here. Existing schedule weather can lack an observation time. |
| Public splits, liability and prediction | No input is used for these. There are no weights, predictions or recommended selections. |

Quotes require a book, provider, provider event ID, recognized full-game market, exact selection or player, valid American odds, source link and nonfuture provider observation timestamp. Receipt is separately displayed. Source links omit query strings. The schedule window is seven days with a 250-event limit per sport. Quote reads are limited to the selected game and 72 hours of receipts, at most 1,500 rows across six pages. Observation eligibility also requires a timestamp inside that window and before scheduled start. TBD events have no tape. A capped result discloses missing history and suppresses dispersion.

A tape groups one provider event, book, market, selection and player. The two NBA Odds API collector labels share an event-ID namespace and retain their original quote provenance. Conflicting provider namespaces or event IDs for one canonical event suppress comparison. Identical observations at the same provider timestamp count once. Conflicting snapshots or duplicate offers for the same selection within one snapshot are excluded. A selection absent from the latest eligible snapshot is withdrawn. First observed means earliest eligible within the loaded window. The latest point is compared with that point only at the same threshold. A change from Home −2 at −110 to Home −3 at −112 is a line move. Home −3 at −110 to Home −3 at −112 is a same-threshold price change. One eligible observation has no movement estimate.

Dispersion requires two books for the same provider event, market, selection/player and threshold. Their latest eligible observations must be within 30 minutes of fetch and within 15 minutes of the newest comparable quote. American prices are sorted by their raw implied-price ordering. Refresh changes fetch time, while observed and received times retain their source values.

Existing session and membership checks precede protected reads. Existing RLS remains the authorization boundary. Account changes clear results and invalidate in-flight work. Unit tests use synthetic collector rows and a real Supabase query builder with a synthetic fetch transport. Browser acceptance uses synthetic schedules, quotes, auth and transport failures. Production/member coverage is separate from these fixtures.

A future predictive score needs a defined target, frozen method, chronological holdout, baseline comparison, uncertainty and independent validation.

Visual acceptance uses the app’s dark theme at 360, 390 and 1280 pixels after the brand opening closes. The app currently pins the theme to dark. The first three negative controls exercise presentation assertions by perturbing rendered output. The NBA identity control injects a conflicting provider event ID into the real reader input.

## Quote coverage

The reader requests a fixed 72-hour receipt window, ending when the fetch starts, and asks only for supported markets. It follows receipt time descending and row ID ascending, preserving microseconds at ties, in at most six 250-row pages. One extra row per request tests whether another page exists. A failed later page retains only the successful subset; the display labels its movement and suppresses dispersion. Navigation, account changes and retries abort obsolete reads. Observations and their original timestamps are preserved; the loaded range can be shorter than requested and can contain gaps.

Read-only sample on November 7, 2026: four upcoming NFL events each had 1,039–1,102 source rows, 717–735 in the supported markets, and six books. The old 500-row order loaded a 33-hour observation span versus 68.3–69.5 hours present. Five sampled NBA events had 40–87 rows across six books and five markets, with 3.3–7.3 hours of observed history. Up to 43 NFL rows and 18 NBA rows shared a receipt timestamp. This is a source assessment, separate from browser fixtures and authenticated-preview testing.
