-- The qualification report (shadow_evaluate.py report) pages public.nfl_shadow_evaluation_rows,
-- whose per-row closing-odds lookup scanned every odds snapshot of the game and whose current-outcome
-- lookup scanned all corrections. A 1,000-row page took ~35 s, past the API timeout, so every report
-- since Oct 18 failed with HTTP 500. Index-only change: no data, function or result changes.
create index if not exists source_observations_book_market_idx
  on public.source_observations (game_id, kind, (payload->>'book'), (payload->>'market'), observed_at desc);
create index if not exists nfl_shadow_outcome_corrections_forecast_idx
  on private.nfl_shadow_outcome_corrections (forecast_id, recorded_at desc, id desc);
