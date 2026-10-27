-- public.nfl_shadow_scan_coverage counts forecasts per scan run; without an index on run_id each of
-- ~150 runs scanned the whole 190 MB forecast table, so the qualification report's coverage step
-- timed out with HTTP 500 right after the evaluation rows. Index-only change.
create index if not exists nfl_shadow_forecasts_run_idx on private.nfl_shadow_forecasts (run_id);
