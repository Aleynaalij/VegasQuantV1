select cron.schedule('multisport-source-refresh','8,23,38,53 * * * *',$job$
 select net.http_post(url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/sports-sync',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
select cron.schedule('multisport-results-refresh','11,26,41,56 * * * *',$job$
 select net.http_post(url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/sports-results',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),body:='{}'::jsonb,timeout_milliseconds:=120000);
$job$);
