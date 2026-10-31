-- New free NHL research-context job only; existing source/odds/publication schedules are unchanged.
do $$begin
 if not exists(select 1 from vault.decrypted_secrets where name='vq_source_sync_token' and length(decrypted_secret)>0) then raise exception 'Existing authorized feed token required';end if;
 if exists(select 1 from cron.job where jobname='nhl-context-refresh') then raise exception 'NHL context schedule already exists; do not duplicate';end if;
end $$;
select cron.schedule('nhl-context-refresh','5,15,25,35,45,55 * * * *',$job$
 select net.http_post(url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/nhl-context',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
 body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
