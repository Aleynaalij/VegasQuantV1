-- Database load relief (Mike, 2026-11-22). Production froze on 2026-11-21 ~07:55 UTC (cron "job
-- startup timeout", then no connections for ~10h until a manual restart) and showed the same
-- pattern briefly on 2026-11-22 04:34 UTC. Two every-5-minute checks were reading far more than
-- they needed, and the minute-aligned jobs all fired in the same second.
--
-- Indexes (production built them CONCURRENTLY first; IF NOT EXISTS makes these no-ops there):
--  * feed_runs (provider, created_at desc): claim_nfl_live_props_run sums 30 days of one provider's
--    runs; before, it walked ~112k rows of every provider (4.7 s).
--  * source_observations (kind, recorded_at desc): dispatch_model_scan's "new odds in the last 10
--    minutes" check, with no game_id; 3 s before, 5 ms after.
create index if not exists feed_runs_provider_created_idx
  on public.feed_runs (provider, created_at desc);
create index if not exists source_observations_kind_recorded_idx
  on public.source_observations (kind, recorded_at desc);

-- Cron: social notification dispatch every 30 s instead of 10 s (it only posts when deliveries are
-- due), the feed health check every 10 minutes, and the remaining every-5-minute dispatchers moved
-- off minute :00 so they no longer start together. Previous schedules, for rollback:
--   vq-social-notifications '10 seconds'; vq-feed-health-check, model-scan-dispatch,
--   nba-shadow-scan-dispatch, vq-sportradar-collection '*/5 * * * *'.
do $$
declare j record;
begin
  for j in
    select * from (values
      ('vq-social-notifications', '30 seconds'),
      ('model-scan-dispatch', '1-59/5 * * * *'),
      ('nba-shadow-scan-dispatch', '2-59/5 * * * *'),
      ('vq-feed-health-check', '3-59/10 * * * *'),
      ('vq-sportradar-collection', '4-59/5 * * * *')
    ) as s(name, schedule)
  loop
    perform cron.alter_job(c.jobid, schedule := j.schedule)
      from cron.job c where c.jobname = j.name;
  end loop;
end $$;
