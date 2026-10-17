-- The hosted shadow scan (.github/workflows/model-scan.yml) can journal a forecast only while the
-- FanDuel prop quote behind it is under 15 minutes old. Props arrive in batches about every six
-- hours, and GitHub ran the 10-minute schedule 7 times in its first day, never inside one of those
-- windows, so the journal holds no forecasts. Supabase now starts the scan itself: every 5 minutes
-- it checks for a FanDuel prop snapshot newer than the last dispatch and, if one arrived in the last
-- 10 minutes, asks GitHub to run the workflow once for it. GitHub's schedule stays as a backup.
--
-- Uses the same Vault token as the research board timer ('github_research_board_token':
-- this repository only, Actions read and write). Without it the job does nothing.
create table if not exists private.workflow_dispatches(
 workflow text primary key,
 last_source_at timestamptz not null,
 dispatched_at timestamptz not null default now()
);
alter table private.workflow_dispatches enable row level security;
revoke all on private.workflow_dispatches from public, anon, authenticated, service_role;

create or replace function private.dispatch_model_scan() returns void
language plpgsql security definer set search_path='' as $$
declare token text; latest timestamptz; previous timestamptz;
begin
 select max(o.recorded_at) into latest from public.source_observations o
 where o.kind='odds' and o.payload->>'book'='FanDuel'
   and o.payload->>'market' in ('player_rush_yds','player_rush_yds_alternate','player_reception_yds','player_reception_yds_alternate')
   and o.recorded_at > now() - interval '10 minutes';
 if latest is null then return; end if;
 select last_source_at into previous from private.workflow_dispatches where workflow='model-scan.yml';
 -- A batch is written over a minute or two; one dispatch per batch.
 if previous is not null and latest <= previous + interval '5 minutes' then return; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='github_research_board_token' limit 1;
 if token is null or token = '' then return; end if;
 perform net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/model-scan.yml/dispatches',
  body := jsonb_build_object('ref','main'),
  headers := jsonb_build_object(
   'Authorization','Bearer '||token,
   'Accept','application/vnd.github+json',
   'X-GitHub-Api-Version','2022-11-28',
   'User-Agent','vegas-quant-model-scan',
   'Content-Type','application/json'));
 insert into private.workflow_dispatches(workflow,last_source_at,dispatched_at) values('model-scan.yml',latest,now())
 on conflict(workflow) do update set last_source_at=excluded.last_source_at, dispatched_at=excluded.dispatched_at;
end $$;
revoke all on function private.dispatch_model_scan() from public, anon, authenticated, service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname='model-scan-dispatch') then
  perform cron.unschedule('model-scan-dispatch');
 end if;
 perform cron.schedule('model-scan-dispatch', '*/5 * * * *', 'select private.dispatch_model_scan()');
end $$;
