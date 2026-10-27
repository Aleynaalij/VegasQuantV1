select cron.schedule('vegas-quant-editorial-results','*/5 * * * *',$job$
 select net.http_post(
 url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/result-sync',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
 body:='{}'::jsonb,timeout_milliseconds:=120000
 );
$job$);
