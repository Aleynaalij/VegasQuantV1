-- Refuse unknown/drifted synthetic baselines. Never enable RLS or repair grants
-- implicitly: an operator/security review must approve that separate change.
do $validate_stage_catalog$
declare
  target text;
  relation pg_catalog.pg_class%rowtype;
begin
  if current_user <> 'postgres' then raise exception 'Staging installer requires the reviewed postgres owner'; end if;
  foreach target in array array[
    'public.games', 'public.nba_games', 'public.nba_observations',
    'public.analysis_versions', 'public.market_snapshots', 'public.published_legs',
    'public.research_feed_posts', 'public.source_observations',
    'vq_fixture.sports', 'vq_fixture.posts',
    'vq_fixture.entitlements', 'vq_fixture.age_states'
  ] loop
    select * into relation from pg_catalog.pg_class where oid = to_regclass(target);
    if not found or relation.relkind <> 'r' or not relation.relrowsecurity
      or pg_catalog.pg_get_userbyid(relation.relowner) <> 'postgres'
      or not pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT')
      or pg_catalog.has_table_privilege('authenticated', relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_table_privilege('anon', relation.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      or pg_catalog.has_any_column_privilege('authenticated', relation.oid, 'INSERT,UPDATE,REFERENCES')
      or pg_catalog.has_any_column_privilege('anon', relation.oid, 'INSERT,UPDATE,REFERENCES') then
      raise exception 'Unsafe isolated relation baseline: % (kind/RLS/owner/read-only grants)', target;
    end if;
  end loop;
  if exists (
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'vq_fixture') and c.relkind in ('v', 'm')
      and (pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
        or pg_catalog.has_table_privilege('anon', c.oid, 'SELECT'))
  ) then raise exception 'Unreviewed readable isolated view path'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'vq_fixture')
      and (p.prosecdef or pg_catalog.pg_get_userbyid(p.proowner) <> 'postgres')
      and (pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'))
  ) then raise exception 'Unreviewed callable isolated definer/owner path'; end if;
end
$validate_stage_catalog$;
