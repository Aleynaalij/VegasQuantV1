-- Atomic claims and conservative additional-collector credit reservations. No provider setting changes.
create or replace function public.claim_nfl_live_props_run() returns uuid language plpgsql security invoker set search_path='' as $$
declare r uuid;
begin
 perform pg_advisory_xact_lock(73488913);
 if exists(select 1 from public.feed_runs where provider='The Odds API live props' and (created_at>now()-interval '1 minute' or (status='running' and created_at>now()-interval '3 minutes'))) then return null;end if;
 if (select coalesce(sum(coalesce((details->>'reserved_credits')::numeric,0)),0) from public.feed_runs where provider='The Odds API live props' and created_at>now()-interval '24 hours')+12>600
 or (select coalesce(sum(coalesce((details->>'reserved_credits')::numeric,0)),0) from public.feed_runs where provider='The Odds API live props' and created_at>now()-interval '30 days')+12>4000 then return null;end if;
 insert into public.feed_runs(provider,status,details)values('The Odds API live props','running','{"reserved_credits":12}') returning id into r;
 return r;
end $$;
revoke all on function public.claim_nfl_live_props_run() from public,anon,authenticated;
grant execute on function public.claim_nfl_live_props_run() to service_role;
-- Activate after deployment; existing pregame and Sportradar jobs stay unchanged.
-- select cron.schedule('vq-nfl-live-props','*/5 * * * *',$job$
-- select net.http_post(url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/nfl-live-props',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);$job$);
