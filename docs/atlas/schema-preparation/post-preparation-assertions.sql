-- Read-only rejection assertions for a future approved staging preparation.
-- Standalone DO, not a stored function (do not install assertion text as a function).
do $verify_staging$
declare unsafe text[];
begin
 select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) into unsafe
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname not in ('pg_catalog','information_schema','extensions','vault','pgsodium','realtime','storage','auth','net','cron','pgbouncer')
 and n.nspname !~ '^(graphql|supabase_|pg_toast|pg_temp)' and ( lower(coalesce(p.prosrc,'')) like '%vegasquant.app%'
  or lower(coalesce(p.prosrc,'')) ~ '\mnet\.'
  or lower(coalesce(p.prosrc,'')) like '%http_post%'
  or lower(coalesce(p.prosrc,'')) like '%vault.decrypted_secrets%' or lower(p.prosrc) like '%uowearboulykfcwnuirn%');
 if cardinality(unsafe)>0 then raise exception 'Outbound/provider function bodies remain: %',unsafe;end if;
 if exists(select 1 from pg_extension where extname in ('pg_net','pg_cron','http','dblink','postgres_fdw')) then
  raise exception 'Forbidden outbound/scheduler extension';end if;
 if exists(select 1 from vault.secrets) then raise exception 'Staging vault must be empty';end if;
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime') then
  raise exception 'Staging realtime must be empty';end if;
 if to_regclass('private.existing_member_premium') is not null then
  raise exception 'Complimentary premium table must be excluded';end if;
 if to_regprocedure('private.is_dealer_publisher(uuid)') is not null or exists(
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema','extensions','vault','pgsodium','realtime','storage','auth','net','cron','pgbouncer') and n.nspname !~ '^(graphql|supabase_|pg_toast|pg_temp)' and (prosrc like '%is_dealer_publisher%' or prosrc like '%existing_member_premium%')) then
  raise exception 'Dealer/premium source adaptation incomplete';end if;
 select array_agg(p.oid::regprocedure::text) into unsafe
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
 lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='private' and a.grantee=0 and a.privilege_type='EXECUTE';
 if cardinality(unsafe)>0 then raise exception 'Unapproved PUBLIC execute on private functions: %',unsafe;end if;
 if to_regclass('vq_fixture.published_legs_preserved') is not null and
  has_table_privilege('authenticated','vq_fixture.published_legs_preserved','SELECT') then
  raise exception 'Archive authenticated SELECT must be revoked';end if;
if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','p') and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))) then raise exception 'Anonymous public data access remains';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('private','vq_private_access_stage') and c.relkind='r' and not c.relrowsecurity and (has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_any_column_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE') or has_any_column_privilege('anon',c.oid,'SELECT,INSERT,UPDATE'))) then raise exception 'RLS-disabled store exposed to caller';end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where case when n.nspname in ('public','private') and c.relkind='S' then has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') else false end) then raise exception 'Anonymous sequence access remains';end if;
end $verify_staging$;
