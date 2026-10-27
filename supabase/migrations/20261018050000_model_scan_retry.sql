-- Review follow-up to 20261018030000. net.http_post only queues the request, so a dispatch GitHub
-- rejected (expired token, rate limit, 5xx) used to mark its prop batch as handled and was never retried. The dispatcher now
-- keeps the request id and re-sends, up to three attempts, until GitHub answers with a 2xx.
-- Retries follow the stored batch, not a fresh-row lookup, so all three fit the 5-minute cadence;
-- they stop once the batch is 15 minutes old, when its quotes can no longer be journaled.
alter table private.workflow_dispatches add column if not exists request_id bigint, add column if not exists attempts int not null default 1;

create or replace function private.dispatch_model_scan() returns void
language plpgsql security definer set search_path='' as $$
declare token text; latest timestamptz; prior private.workflow_dispatches; status int; answered boolean; request bigint; retry boolean:=false;
begin
 select max(o.recorded_at) into latest from public.source_observations o
 where o.kind='odds' and o.payload->>'book'='FanDuel'
   and o.payload->>'market' in ('player_rush_yds','player_rush_yds_alternate','player_reception_yds','player_reception_yds_alternate')
   and o.recorded_at > now() - interval '10 minutes';
 select * into prior from private.workflow_dispatches where workflow='model-scan.yml';
 -- A batch is written over a minute or two: rows within 5 minutes of the dispatched one are the same batch.
 if prior.workflow is not null and (latest is null or latest <= prior.last_source_at + interval '5 minutes') then
  if prior.last_source_at < now() - interval '15 minutes' or prior.attempts >= 3 then return; end if;
  select true, r.status_code into answered, status from net._http_response r where r.id=prior.request_id;
  -- Accepted, or still waiting for GitHub's answer.
  if status between 200 and 299 or answered is null then return; end if;
  retry := true;
 elsif latest is null then
  return;
 end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='github_research_board_token' limit 1;
 if token is null or token = '' then return; end if;
 request := net.http_post(
  url := 'https://api.github.com/repos/Aleynaalij/VegasQuantV1/actions/workflows/model-scan.yml/dispatches',
  body := jsonb_build_object('ref','main'),
  headers := jsonb_build_object(
   'Authorization','Bearer '||token,
   'Accept','application/vnd.github+json',
   'X-GitHub-Api-Version','2022-11-28',
   'User-Agent','vegas-quant-model-scan',
   'Content-Type','application/json'));
 if retry then
  update private.workflow_dispatches set attempts=attempts+1, dispatched_at=now(), request_id=request where workflow='model-scan.yml';
 else
  insert into private.workflow_dispatches(workflow,last_source_at,dispatched_at,request_id,attempts) values('model-scan.yml',latest,now(),request,1)
  on conflict(workflow) do update set last_source_at=excluded.last_source_at, dispatched_at=excluded.dispatched_at,
   request_id=excluded.request_id, attempts=1;
 end if;
end $$;
revoke all on function private.dispatch_model_scan() from public, anon, authenticated, service_role;
