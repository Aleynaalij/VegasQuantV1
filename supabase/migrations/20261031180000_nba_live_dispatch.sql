-- The old pause-era daily dispatcher still gated the rescheduled jobs at 6 a.m. ET.
-- Keep that wrapper for the existing daily confirmation job; live jobs use a restricted,
-- all-day dispatcher with the same vault token and function allowlist.
create function private.nba_live_post(fn text) returns bigint
language plpgsql security definer set search_path='' as $$
begin
 if fn not in ('nba-sync','nba-results') or fn is null then raise exception 'Unknown NBA function';end if;
 return net.http_post(
  url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/'||fn,
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
   (select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
  body:='{}'::jsonb,timeout_milliseconds:=120000);
end $$;
revoke all on function private.nba_live_post(text) from public,anon,authenticated,service_role;
do $$ declare source_job bigint; result_job bigint;begin
 select jobid into source_job from cron.job where jobname='nba-source-refresh';
 select jobid into result_job from cron.job where jobname='nba-results-refresh';
 if source_job is null or result_job is null then raise exception 'Expected existing NBA refresh jobs';end if;
 perform cron.alter_job(source_job,schedule:='2,17,32,47 * * * *',command:=$job$select private.nba_live_post('nba-sync')$job$);
 perform cron.alter_job(result_job,schedule:='5,20,35,50 * * * *',command:=$job$select private.nba_live_post('nba-results')$job$);
end $$;
