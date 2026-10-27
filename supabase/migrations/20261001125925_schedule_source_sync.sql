-- Hosted Supabase scheduling. Token is provisioned in Vault, never committed.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('vegas-quant-source-refresh','*/15 * * * *', $job$
 select net.http_post(
  url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/source-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
  body:='{}'::jsonb, timeout_milliseconds:=120000
 );
$job$);
