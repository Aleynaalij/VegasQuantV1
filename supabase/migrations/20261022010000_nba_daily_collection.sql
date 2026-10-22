-- NBA paused (owner decision, Oct 22 2026): the NBA pages are closed and NBA data is collected once a day,
-- for the record only, until the season has enough games to reference.
--  * nba-sync (ESPN schedule, scores and injuries; The Odds API lines and props within 36 hours) runs at
--    6:00 a.m. Eastern instead of every 15 minutes. Its cadence rules still apply, so each morning reads
--    today's lines and props once.
--  * nba-results reads the previous night's box scores at 6:05 a.m. A final box score is recorded only
--    when the same numbers are read again 3 hours later (20261018070000), so a free ESPN confirming read
--    runs at 9:10 a.m.; anything still unconfirmed is picked up the next morning.
--  * The NBA shadow scan stops: its dispatcher is unscheduled (the model stays SHADOW_ONLY, unchanged).
-- pg_cron runs in UTC, so each job is scheduled at both the EDT and EST hour and runs only when it is that
-- hour in New York.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.nba_daily_post(fn text, et_hour int) returns void
language plpgsql security definer set search_path='' as $$
begin
 if fn not in ('nba-sync', 'nba-results') then raise exception 'Unknown NBA function'; end if;
 if extract(hour from now() at time zone 'America/New_York') <> et_hour then return; end if;
 perform net.http_post(
  url := 'https://uowearboulykfcwnuirn.supabase.co/functions/v1/' || fn,
  headers := jsonb_build_object('Content-Type', 'application/json',
   'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'vq_source_sync_token')),
  body := '{}'::jsonb, timeout_milliseconds := 120000);
end $$;
revoke all on function private.nba_daily_post(text, int) from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname = 'nba-source-refresh') then perform cron.unschedule('nba-source-refresh'); end if;
 if exists (select 1 from cron.job where jobname = 'nba-results-refresh') then perform cron.unschedule('nba-results-refresh'); end if;
 if exists (select 1 from cron.job where jobname = 'nba-shadow-scan-dispatch') then perform cron.unschedule('nba-shadow-scan-dispatch'); end if;
 perform cron.schedule('nba-source-refresh', '0 10,11 * * *', $j$select private.nba_daily_post('nba-sync', 6)$j$);
 perform cron.schedule('nba-results-refresh', '5 10,11 * * *', $j$select private.nba_daily_post('nba-results', 6)$j$);
 perform cron.schedule('nba-results-confirm', '10 13,14 * * *', $j$select private.nba_daily_post('nba-results', 9)$j$);
end $$;
