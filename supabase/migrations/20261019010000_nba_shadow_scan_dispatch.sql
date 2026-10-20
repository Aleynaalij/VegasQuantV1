-- GitHub ran the NBA shadow scan's 15-minute schedule only 11 times between Oct 17 21:42Z and Oct 19
-- 05:17Z. A FanDuel props snapshot arrives at most every 30 minutes to 6 hours and the scan only accepts
-- quotes received within 30 minutes, so the first opening-night props (Oct 19 07:02Z) were never
-- scanned. Supabase's scheduler now starts the workflow, the same way as the NFL model scan
-- (20261018030000/20261018050000): every 5 minutes it looks for a FanDuel points or rebounds snapshot
-- of an upcoming regular-season game newer than the last dispatch and, if one arrived in the last 10
-- minutes, asks GitHub to run the workflow once for that batch. net.http_post only queues the request,
-- so the request id is kept and a dispatch GitHub rejected is re-sent, up to three attempts, until the
-- batch is 15 minutes old. The workflow's own GitHub schedule is removed so one batch starts one run.
--
-- Uses the research board's Vault token ('github_research_board_token': this repository only,
-- Actions read and write). Without it the job does nothing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function private.dispatch_nba_shadow_scan() returns void
language plpgsql security definer set search_path='' as $$
declare token text; latest timestamptz; prior private.workflow_dispatches; status int; answered boolean; request bigint; retry boolean := false;
begin
 select max(o.recorded_at) into latest from public.nba_observations o join public.nba_games g on g.id = o.game_id
 where o.kind = 'prop' and o.payload->>'book' = 'FanDuel' and o.payload->>'market' in ('player_points', 'player_rebounds')
   and o.recorded_at > now() - interval '10 minutes'
   and g.season_type = 2 and not g.tipoff_tbd and g.tipoff > now() and g.tipoff <= now() + interval '36 hours';
 select * into prior from private.workflow_dispatches where workflow = 'nba-shadow-scan.yml';
 -- A batch is written within a minute or two: rows within 5 minutes of the dispatched one are the same batch.
 if prior.workflow is not null and (latest is null or latest <= prior.last_source_at + interval '5 minutes') then
  if prior.last_source_at < now() - interval '15 minutes' or prior.attempts >= 3 then return; end if;
  select true, r.status_code into answered, status from net._http_response r where r.id = prior.request_id;
  -- Accepted, or still waiting for GitHub's answer.
  if status between 200 and 299 or answered is null then return; end if;
  retry := true;
 elsif latest is null then
  return;
 end if;
 select decrypted_secret into token from vault.decrypted_secrets where name = 'github_research_board_token' limit 1;
 if token is null or token = '' then return; end if;
 request := net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/nba-shadow-scan.yml/dispatches',
  body := jsonb_build_object('ref', 'main'),
  headers := jsonb_build_object(
   'Authorization', 'Bearer ' || token,
   'Accept', 'application/vnd.github+json',
   'X-GitHub-Api-Version', '2022-11-28',
   'User-Agent', 'vegas-quant-nba-shadow-scan',
   'Content-Type', 'application/json'));
 if retry then
  update private.workflow_dispatches set attempts = attempts + 1, dispatched_at = now(), request_id = request where workflow = 'nba-shadow-scan.yml';
 else
  insert into private.workflow_dispatches(workflow, last_source_at, dispatched_at, request_id, attempts)
  values('nba-shadow-scan.yml', latest, now(), request, 1)
  on conflict(workflow) do update set last_source_at = excluded.last_source_at, dispatched_at = excluded.dispatched_at,
   request_id = excluded.request_id, attempts = 1;
 end if;
end $$;
revoke all on function private.dispatch_nba_shadow_scan() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname = 'nba-shadow-scan-dispatch') then
  perform cron.unschedule('nba-shadow-scan-dispatch');
 end if;
 perform cron.schedule('nba-shadow-scan-dispatch', '*/5 * * * *', 'select private.dispatch_nba_shadow_scan()');
end $$;
