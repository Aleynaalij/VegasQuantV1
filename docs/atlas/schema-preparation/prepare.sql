-- GENERATED from replay-catalog + bf1c08a adaptations. REVIEW HASH BEFORE EXECUTION.
-- ONLY project caynldluziwrzmvuslzg. GUC is an assertion, not connection provenance.
-- Executor MUST use the connector's literal project_id, verify this file's SHA256,
-- and have Claude's sign-off for that exact hash. No production target accepted.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
set local search_path=pg_catalog,public;
set local vq.review.target_ref='caynldluziwrzmvuslzg';
select pg_advisory_xact_lock(hashtextextended('atlas-staging-preparation-v1',0));
do $target$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('vq.review.target_ref',true) is distinct from 'caynldluziwrzmvuslzg' then raise exception 'Pinned staging executor required';end if;
 if to_regnamespace('private') is not null or to_regnamespace('vq_private_access_stage') is not null then raise exception 'Preparation is single-use; refusing existing schemas';end if;
 if (select count(*) from supabase_migrations.schema_migrations where (version,name) in (('20261115172210','consumer_phase1_synthetic_contract_fixture'),('20261115173820','consumer_phase1_synthetic_age_shell')))<>2 then raise exception 'Reduced staging migration identity mismatch';end if;
 if (select count(*) from auth.users)<>4 or exists(select 1 from auth.sessions) then raise exception 'Unexpected identity/session baseline';end if;
 end $target$;
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

do $catalog_checks$ declare atlas_check record;begin for atlas_check in with
fn as (
  select n.nspname, p.proname, p.oid, p.prosecdef, p.proacl, r.rolname owner,
         pg_get_function_identity_arguments(p.oid) args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
  where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                          'pgbouncer','realtime','storage','vault','supabase_functions','net','cron','auth','pgsodium')
),
cnt as (
  select
    (select count(*) from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_fn,
    (select string_agg(nspname||'.'||proname, ', ') from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_list,
    (select count(*) from pg_extension where extname in ('pg_net','pg_cron','http','dblink','postgres_fdw')) outbound_ext,
    case when to_regclass('vault.secrets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from vault.secrets', false, true, '')))[1]::text::int end vault_secrets,
    case when to_regclass('storage.buckets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from storage.buckets', false, true, '')))[1]::text::int end buckets,
    (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') realtime_tables,
    (select count(*) from auth.users where email is not null and email !~* '\.invalid$') real_emails,
    (select count(*) from auth.users where phone is not null and phone <> '') phones,
    (select count(*) from auth.sessions) sessions,
    (select count(*) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal) auth_triggers,
    (select count(*) from pg_namespace where nspname = 'supabase_functions') webhook_schema,
    (select count(*) from fn where nspname = 'private'
       and (proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) private_public_exec,
    (select count(*) from fn where prosecdef and owner <> 'postgres') definer_wrong_owner,
    (select count(*) from fn f join pg_proc p on p.oid = f.oid where f.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')) definer_no_search_path,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity) public_no_rls,
    to_regnamespace('private') is not null private_exists,
    to_regprocedure('private.has_membership()') is not null has_membership_exists,
    to_regprocedure('private.age_eligible(uuid)') is not null age_eligible_exists,
    to_regprocedure('private.age_member_allowed()') is not null age_member_allowed_exists,
    to_regnamespace('vq_private_access_stage') is not null gate_exists,
    (select relkind from pg_class where oid = to_regclass('public.published_legs')) pl_kind,
    to_regclass('vq_fixture.published_legs_preserved') is not null archive_exists,
    (select count(*) from fn where proname in ('is_dealer_publisher','invoke_push_dispatcher','invoke_live_pick_alerts','invoke_social_dispatch')) excluded_fns,
    to_regclass('private.existing_member_premium') is not null comp_premium_table
),
checks(phase, name, ok, detail) as (
  select 'isolation','no function body reaches production or outbound HTTP/vault', outbound_fn = 0, coalesce(outbound_list,'none') from cnt
  union all select 'isolation','no pg_net/pg_cron/http/dblink/postgres_fdw', outbound_ext = 0, outbound_ext::text from cnt
  union all select 'isolation','vault.secrets empty', vault_secrets = 0, vault_secrets::text from cnt
  union all select 'isolation','no storage buckets', buckets = 0, buckets::text from cnt
  union all select 'isolation','no realtime publication tables', realtime_tables = 0, realtime_tables::text from cnt
  union all select 'isolation','auth users are synthetic (*.invalid, no phone)', real_emails = 0 and phones = 0, real_emails||' real emails, '||phones||' phones' from cnt
  union all select 'isolation','no auth.users triggers', auth_triggers = 0, auth_triggers::text from cnt
  union all select 'isolation','no database webhooks schema', webhook_schema = 0, webhook_schema::text from cnt
  union all select 'isolation','sessions (0 until isolation is accepted)', sessions = 0, sessions::text from cnt
  union all select 'isolation','every public table has RLS on', public_no_rls = 0, public_no_rls::text from cnt
  union all select 'isolation','definer functions owned by postgres', definer_wrong_owner = 0, definer_wrong_owner::text from cnt
  union all select 'isolation','definer functions pin search_path', definer_no_search_path = 0, definer_no_search_path::text from cnt
  union all select 'isolation','excluded functions absent (Dealer, dispatchers)', excluded_fns = 0, excluded_fns::text from cnt
  union all select 'isolation','complimentary-premium table absent', not comp_premium_table, comp_premium_table::text from cnt
  union all select 'prepared','gate schema installed', gate_exists, gate_exists::text from cnt
  union all select 'prepared','private schema present', private_exists, private_exists::text from cnt
  union all select 'prepared','no private function executable by PUBLIC (F3)', private_exists and private_public_exec = 0, private_public_exec::text from cnt
  union all select 'prepared','has_membership requires age (M1)', has_membership_exists and exists (
      select 1 from fn where nspname='private' and proname='has_membership' and prosrc ~ 'age_member_allowed'), has_membership_exists::text from cnt
  union all select 'prepared','age_member_allowed is definer (M2)', exists (
      select 1 from fn where nspname='private' and proname='age_member_allowed' and prosecdef), age_member_allowed_exists::text from cnt
  union all select 'prepared','age_eligible not executable by authenticated/anon (M2)', age_eligible_exists and not exists (
      select 1 from fn, aclexplode(coalesce(proacl, acldefault('f', (select oid from pg_roles where rolname = fn.owner)))) a
      where nspname='private' and proname='age_eligible' and a.privilege_type='EXECUTE'
        and a.grantee in (0, (select oid from pg_roles where rolname='authenticated'), (select oid from pg_roles where rolname='anon'))),
      age_eligible_exists::text from cnt
  union all select 'prepared','published_legs is a security-invoker view', pl_kind = 'v' and exists (
      select 1 from pg_class where oid = to_regclass('public.published_legs') and 'security_invoker=true' = any(coalesce(reloptions,'{}'))),
      coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs not granted to anon/PUBLIC', pl_kind = 'v' and not exists (
      select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = to_regclass('public.published_legs')
        and a.grantee in (0, (select oid from pg_roles where rolname='anon'))), coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs archive kept in vq_fixture', archive_exists, archive_exists::text from cnt
)
select phase, name,
  case when ok then 'PASS' when phase = 'prepared' and not (select private_exists or gate_exists from cnt) then 'NOT_PREPARED' else 'FAIL' end result,
  detail
from checks
union all
-- Preserved data: digests must equal the 2026-11-19 baseline (#294). Identity tables are limited to
-- the four baseline users, so reviewed negative-control identities (M5) may be added without
-- masking a change to existing rows, and identity rows are digested on their original columns
-- (user_id,allowed / user_id,verified) so the planned nullable entitlement bounds don't change them.
-- published_legs is read from the archive after the cutover.
select 'preserved', t.tbl,
  case when d.digest = t.baseline and d.n = t.rows then 'PASS' else 'FAIL' end,
  d.n||' rows, '||d.digest
from (values
  ('auth.users ids', 4, 'd49852dd726bfce1ac4d2f99bdcc05f4', 'select id::text x from auth.users where id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('public.games', 1, '0d4f96e41536c949ef4d95a5b4f5c6a5', 'select x::text x from public.games x'),
  ('public.nba_games', 1, 'bdae35bbdd8287e0f15464b5476ee623', 'select x::text x from public.nba_games x'),
  ('public.nba_observations', 1, '643eaae6c67e24ac752455074b80fd11', 'select x::text x from public.nba_observations x'),
  ('public.source_observations', 1, 'e06558504a3848d531eb98e56124379d', 'select x::text x from public.source_observations x'),
  ('vq_fixture.posts', 4, '41bd600253186d02cb3b466a9031357e', 'select x::text x from vq_fixture.posts x'),
  ('vq_fixture.sports', 2, '5f9f57bd3f4eb317dea0289e325887c7', 'select x::text x from vq_fixture.sports x'),
  ('vq_fixture.age_states', 3, '416b0b9c1ca06c3f8b25e61ec2a44061', 'select row(user_id,verified)::text x from vq_fixture.age_states x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('vq_fixture.entitlements', 3, '306327816f76304de7b1b2739d6ac5fd', 'select row(user_id,allowed)::text x from vq_fixture.entitlements x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('published_legs (table or archive)', 0, 'd41d8cd98f00b204e9800998ecf8427e',
     case when to_regclass('vq_fixture.published_legs_preserved') is not null
          then 'select x::text x from vq_fixture.published_legs_preserved x'
          else 'select x::text x from public.published_legs x' end)
) t(tbl, rows, baseline, q)
cross join lateral (
  select (xpath('/row/n/text()', r))[1]::text::int n, (xpath('/row/d/text()', r))[1]::text digest
  from query_to_xml(
    'select count(*) n, md5(coalesce(string_agg(x, ''|'' order by x), '''')) d from (' || t.q || ') s',
    false, true, '') r
) d
order by 1, 2 loop
 if atlas_check.phase <> 'prepared' and atlas_check.result<>'PASS' then raise exception 'Staging catalog check failed: % / % / %',atlas_check.phase,atlas_check.name,atlas_check.detail;end if;end loop;end $catalog_checks$;

lock table public.analysis_versions,public.games,public.market_snapshots,public.nba_games,public.nba_observations,public.published_legs,public.research_feed_posts,public.source_observations,vq_fixture.age_states,vq_fixture.entitlements,vq_fixture.posts,vq_fixture.sports in access exclusive mode;

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

do $catalog_checks$ declare atlas_check record;begin for atlas_check in with
fn as (
  select n.nspname, p.proname, p.oid, p.prosecdef, p.proacl, r.rolname owner,
         pg_get_function_identity_arguments(p.oid) args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
  where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                          'pgbouncer','realtime','storage','vault','supabase_functions','net','cron','auth','pgsodium')
),
cnt as (
  select
    (select count(*) from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_fn,
    (select string_agg(nspname||'.'||proname, ', ') from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_list,
    (select count(*) from pg_extension where extname in ('pg_net','pg_cron','http','dblink','postgres_fdw')) outbound_ext,
    case when to_regclass('vault.secrets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from vault.secrets', false, true, '')))[1]::text::int end vault_secrets,
    case when to_regclass('storage.buckets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from storage.buckets', false, true, '')))[1]::text::int end buckets,
    (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') realtime_tables,
    (select count(*) from auth.users where email is not null and email !~* '\.invalid$') real_emails,
    (select count(*) from auth.users where phone is not null and phone <> '') phones,
    (select count(*) from auth.sessions) sessions,
    (select count(*) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal) auth_triggers,
    (select count(*) from pg_namespace where nspname = 'supabase_functions') webhook_schema,
    (select count(*) from fn where nspname = 'private'
       and (proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) private_public_exec,
    (select count(*) from fn where prosecdef and owner <> 'postgres') definer_wrong_owner,
    (select count(*) from fn f join pg_proc p on p.oid = f.oid where f.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')) definer_no_search_path,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity) public_no_rls,
    to_regnamespace('private') is not null private_exists,
    to_regprocedure('private.has_membership()') is not null has_membership_exists,
    to_regprocedure('private.age_eligible(uuid)') is not null age_eligible_exists,
    to_regprocedure('private.age_member_allowed()') is not null age_member_allowed_exists,
    to_regnamespace('vq_private_access_stage') is not null gate_exists,
    (select relkind from pg_class where oid = to_regclass('public.published_legs')) pl_kind,
    to_regclass('vq_fixture.published_legs_preserved') is not null archive_exists,
    (select count(*) from fn where proname in ('is_dealer_publisher','invoke_push_dispatcher','invoke_live_pick_alerts','invoke_social_dispatch')) excluded_fns,
    to_regclass('private.existing_member_premium') is not null comp_premium_table
),
checks(phase, name, ok, detail) as (
  select 'isolation','no function body reaches production or outbound HTTP/vault', outbound_fn = 0, coalesce(outbound_list,'none') from cnt
  union all select 'isolation','no pg_net/pg_cron/http/dblink/postgres_fdw', outbound_ext = 0, outbound_ext::text from cnt
  union all select 'isolation','vault.secrets empty', vault_secrets = 0, vault_secrets::text from cnt
  union all select 'isolation','no storage buckets', buckets = 0, buckets::text from cnt
  union all select 'isolation','no realtime publication tables', realtime_tables = 0, realtime_tables::text from cnt
  union all select 'isolation','auth users are synthetic (*.invalid, no phone)', real_emails = 0 and phones = 0, real_emails||' real emails, '||phones||' phones' from cnt
  union all select 'isolation','no auth.users triggers', auth_triggers = 0, auth_triggers::text from cnt
  union all select 'isolation','no database webhooks schema', webhook_schema = 0, webhook_schema::text from cnt
  union all select 'isolation','sessions (0 until isolation is accepted)', sessions = 0, sessions::text from cnt
  union all select 'isolation','every public table has RLS on', public_no_rls = 0, public_no_rls::text from cnt
  union all select 'isolation','definer functions owned by postgres', definer_wrong_owner = 0, definer_wrong_owner::text from cnt
  union all select 'isolation','definer functions pin search_path', definer_no_search_path = 0, definer_no_search_path::text from cnt
  union all select 'isolation','excluded functions absent (Dealer, dispatchers)', excluded_fns = 0, excluded_fns::text from cnt
  union all select 'isolation','complimentary-premium table absent', not comp_premium_table, comp_premium_table::text from cnt
  union all select 'prepared','gate schema installed', gate_exists, gate_exists::text from cnt
  union all select 'prepared','private schema present', private_exists, private_exists::text from cnt
  union all select 'prepared','no private function executable by PUBLIC (F3)', private_exists and private_public_exec = 0, private_public_exec::text from cnt
  union all select 'prepared','has_membership requires age (M1)', has_membership_exists and exists (
      select 1 from fn where nspname='private' and proname='has_membership' and prosrc ~ 'age_member_allowed'), has_membership_exists::text from cnt
  union all select 'prepared','age_member_allowed is definer (M2)', exists (
      select 1 from fn where nspname='private' and proname='age_member_allowed' and prosecdef), age_member_allowed_exists::text from cnt
  union all select 'prepared','age_eligible not executable by authenticated/anon (M2)', age_eligible_exists and not exists (
      select 1 from fn, aclexplode(coalesce(proacl, acldefault('f', (select oid from pg_roles where rolname = fn.owner)))) a
      where nspname='private' and proname='age_eligible' and a.privilege_type='EXECUTE'
        and a.grantee in (0, (select oid from pg_roles where rolname='authenticated'), (select oid from pg_roles where rolname='anon'))),
      age_eligible_exists::text from cnt
  union all select 'prepared','published_legs is a security-invoker view', pl_kind = 'v' and exists (
      select 1 from pg_class where oid = to_regclass('public.published_legs') and 'security_invoker=true' = any(coalesce(reloptions,'{}'))),
      coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs not granted to anon/PUBLIC', pl_kind = 'v' and not exists (
      select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = to_regclass('public.published_legs')
        and a.grantee in (0, (select oid from pg_roles where rolname='anon'))), coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs archive kept in vq_fixture', archive_exists, archive_exists::text from cnt
)
select phase, name,
  case when ok then 'PASS' when phase = 'prepared' and not (select private_exists or gate_exists from cnt) then 'NOT_PREPARED' else 'FAIL' end result,
  detail
from checks
union all
-- Preserved data: digests must equal the 2026-11-19 baseline (#294). Identity tables are limited to
-- the four baseline users, so reviewed negative-control identities (M5) may be added without
-- masking a change to existing rows, and identity rows are digested on their original columns
-- (user_id,allowed / user_id,verified) so the planned nullable entitlement bounds don't change them.
-- published_legs is read from the archive after the cutover.
select 'preserved', t.tbl,
  case when d.digest = t.baseline and d.n = t.rows then 'PASS' else 'FAIL' end,
  d.n||' rows, '||d.digest
from (values
  ('auth.users ids', 4, 'd49852dd726bfce1ac4d2f99bdcc05f4', 'select id::text x from auth.users where id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('public.games', 1, '0d4f96e41536c949ef4d95a5b4f5c6a5', 'select x::text x from public.games x'),
  ('public.nba_games', 1, 'bdae35bbdd8287e0f15464b5476ee623', 'select x::text x from public.nba_games x'),
  ('public.nba_observations', 1, '643eaae6c67e24ac752455074b80fd11', 'select x::text x from public.nba_observations x'),
  ('public.source_observations', 1, 'e06558504a3848d531eb98e56124379d', 'select x::text x from public.source_observations x'),
  ('vq_fixture.posts', 4, '41bd600253186d02cb3b466a9031357e', 'select x::text x from vq_fixture.posts x'),
  ('vq_fixture.sports', 2, '5f9f57bd3f4eb317dea0289e325887c7', 'select x::text x from vq_fixture.sports x'),
  ('vq_fixture.age_states', 3, '416b0b9c1ca06c3f8b25e61ec2a44061', 'select row(user_id,verified)::text x from vq_fixture.age_states x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('vq_fixture.entitlements', 3, '306327816f76304de7b1b2739d6ac5fd', 'select row(user_id,allowed)::text x from vq_fixture.entitlements x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('published_legs (table or archive)', 0, 'd41d8cd98f00b204e9800998ecf8427e',
     case when to_regclass('vq_fixture.published_legs_preserved') is not null
          then 'select x::text x from vq_fixture.published_legs_preserved x'
          else 'select x::text x from public.published_legs x' end)
) t(tbl, rows, baseline, q)
cross join lateral (
  select (xpath('/row/n/text()', r))[1]::text::int n, (xpath('/row/d/text()', r))[1]::text digest
  from query_to_xml(
    'select count(*) n, md5(coalesce(string_agg(x, ''|'' order by x), '''')) d from (' || t.q || ') s',
    false, true, '') r
) d
order by 1, 2 loop
 if atlas_check.phase <> 'prepared' and atlas_check.result<>'PASS' then raise exception 'Staging catalog check failed: % / % / %',atlas_check.phase,atlas_check.name,atlas_check.detail;end if;end loop;end $catalog_checks$;

create temporary table atlas_preservation_before on commit drop as
 select 'caynldluziwrzmvuslzg'::text target, 'public.published_legs'::regclass::oid archive_oid;

create schema vq_private_access_stage;
 revoke all on schema vq_private_access_stage from public,anon,authenticated,service_role;
 grant usage on schema vq_private_access_stage to authenticated;

create table vq_private_access_stage.private_development_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);

create table vq_private_access_stage.private_development_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);

revoke all on vq_private_access_stage.private_development_settings,
  vq_private_access_stage.private_development_owners from public, anon, authenticated, service_role;

insert into vq_private_access_stage.private_development_settings default values;

create function vq_private_access_stage.private_development_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select enabled from vq_private_access_stage.private_development_settings)
    when false then true
    when true then
      (auth.jwt() ->> 'aal' = 'aal2') is true
      and (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
      and exists (
        select 1
        from vq_private_access_stage.private_development_owners o
        join auth.users u on u.id = o.user_id
        join auth.sessions s on s.user_id = o.user_id
        where o.user_id = auth.uid()
          and s.id::text = auth.jwt() ->> 'session_id'
          and s.aal = 'aal2'
          and (s.not_after is null or s.not_after > now())
          and u.email_confirmed_at is not null
          and not coalesce(u.is_anonymous, false)
          and u.deleted_at is null
          and (u.banned_until is null or u.banned_until <= now())
      )
    else false
  end
$$;

revoke all on function vq_private_access_stage.private_development_allowed() from public, service_role;
grant execute on function vq_private_access_stage.private_development_allowed() to anon, authenticated;

-- Namespaced acceptance objects. Install only through private-access-stage-install.mjs.
update vq_private_access_stage.private_development_settings set enabled = true;

create table vq_private_access_stage.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true
);
revoke all on vq_private_access_stage.entitlements from public, anon, authenticated, service_role;

create function vq_private_access_stage.authorized()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select vq_private_access_stage.private_development_allowed()
    and exists (
      select 1
      from vq_private_access_stage.entitlements e
      join auth.users u on u.id = e.user_id
      join auth.sessions s on s.user_id = e.user_id
      where e.user_id = auth.uid() and e.active
        and s.id::text = auth.jwt() ->> 'session_id'
        and (s.not_after is null or s.not_after > now())
        and u.email_confirmed_at is not null
        and not coalesce(u.is_anonymous, false)
        and (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
        and u.deleted_at is null
        and (u.banned_until is null or u.banned_until <= now())
    )
$$;
revoke all on function vq_private_access_stage.authorized() from public, anon, authenticated, service_role;
grant execute on function vq_private_access_stage.authorized() to authenticated;

-- The combined app checks its HttpOnly staging session without reading records.
create function public.vq_private_access_stage_authorized()
returns boolean
language sql stable security invoker set search_path = ''
as $$
  select vq_private_access_stage.authorized() is true
$$;
revoke all on function public.vq_private_access_stage_authorized() from public, anon, authenticated, service_role;
grant execute on function public.vq_private_access_stage_authorized() to authenticated;

create table public.vq_private_access_stage_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  record text not null,
  primary key (user_id, record)
);
alter table public.vq_private_access_stage_records enable row level security;
revoke all on public.vq_private_access_stage_records from public, anon, authenticated, service_role;
grant select on public.vq_private_access_stage_records to authenticated;
grant select, insert on public.vq_private_access_stage_records to service_role;
create policy stage_owned_record on public.vq_private_access_stage_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy stage_private_access on public.vq_private_access_stage_records
  as restrictive for select to authenticated using ((select vq_private_access_stage.authorized()));

create function public.vq_private_access_stage_read()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select case when vq_private_access_stage.authorized() then
    (select coalesce(jsonb_agg(record order by record), '[]'::jsonb)
      from public.vq_private_access_stage_records)
  end
$$;
revoke all on function public.vq_private_access_stage_read() from public, anon, authenticated, service_role;
grant execute on function public.vq_private_access_stage_read() to authenticated;

-- PROPOSED / UNREVIEWED. Source for independent review, NOT an installer.
-- Only the future isolated preparation plan may include this after review.
-- Do not copy the local fixture's test.* settings or constant-true helpers.

do $stage_only$
begin
 if current_user <> 'postgres' or session_user <> 'postgres'
  or current_setting('vq.review.target_ref',true) is distinct from 'caynldluziwrzmvuslzg'
  or to_regprocedure('vq_private_access_stage.authorized()') is null
  or to_regprocedure('vq_fixture.allowed()') is null
  or to_regclass('vq_fixture.age_states') is null
  or to_regclass('vq_fixture.entitlements') is null
  or to_regnamespace('private') is not null then
  raise exception 'Review proposal requires the verified isolated gate, explicit target assertion, and absent private schema';
 end if;
end $stage_only$;
-- The GUC is an operator assertion, NOT proof of which project a connection targets.
-- A future executor must independently pin/verify the project before issuing SQL.
create schema private;
revoke all on schema private from public,anon,authenticated,service_role;
grant usage on schema private to authenticated;
-- Per-schema REVOKE alone cannot subtract PostgreSQL global PUBLIC EXECUTE defaults.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema private revoke execute on functions from public;

-- Preserve existing entitlement rows; null temporal bounds preserve existing behavior.
alter table vq_fixture.entitlements add column starts_at timestamptz, add column expires_at timestamptz, add column revoked_at timestamptz;
create or replace function vq_fixture.allowed() returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select e.allowed and e.revoked_at is null
  and (e.starts_at is null or e.starts_at<=now())
  and (e.expires_at is null or e.expires_at>now())
  from vq_fixture.entitlements e where e.user_id=auth.uid()),false)
$$;

-- Target eligibility is needed by original visibility rules for other authors.
-- Definer use is limited to this boolean projection; the caller must pass the live
-- gate. Do not expose age-state records or replace this with caller metadata.
create function private.age_eligible(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(vq_private_access_stage.authorized(),false)
  and p_user is not null
  and exists(select 1 from vq_fixture.age_states a where a.user_id=p_user and a.verified)
$$;

create function private.age_member_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(vq_private_access_stage.authorized(),false)
  and coalesce(private.age_eligible(auth.uid()),false)
$$;

create function private.before_age_has_membership() returns boolean
language sql stable security invoker set search_path='' as $$select coalesce(vq_fixture.allowed(),false)$$;
revoke all on function private.before_age_has_membership() from public,anon,authenticated,service_role;
alter function private.before_age_has_membership() owner to postgres;

create function private.has_membership() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(vq_private_access_stage.authorized(),false)
  and coalesce(private.age_member_allowed(),false)
  and coalesce(private.before_age_has_membership(),false)
$$;
alter function private.age_eligible(uuid) owner to postgres;
alter function private.age_member_allowed() owner to postgres;
alter function private.has_membership() owner to postgres;
revoke all on function private.has_membership(),private.age_eligible(uuid),private.age_member_allowed()
 from public,anon,authenticated,service_role;
grant execute on function private.has_membership(),private.age_member_allowed() to authenticated;
-- age_eligible remains definer-only: no direct caller oracle.
-- Live session/AAL2/not_after checks are delegated to the existing authorized() gate.
-- Anonymous calls are intentionally 42501; no staged anonymous consumer contract is enabled.

alter table public.published_legs set schema vq_fixture;
 alter table vq_fixture.published_legs rename to published_legs_preserved;
 revoke all on vq_fixture.published_legs_preserved from public,anon,authenticated,service_role;

revoke all on vq_fixture.entitlements from public,anon;

revoke all on public.games from public,anon;

revoke all on public.nba_games from public,anon;

revoke all on public.nba_observations from public,anon;

revoke all on public.source_observations from public,anon;

revoke all on public.analysis_versions from public,anon;

revoke all on public.research_feed_posts from public,anon;

revoke all on public.market_snapshots from public,anon;

revoke all on vq_fixture.sports from public,anon;

revoke all on vq_fixture.posts from public,anon;

revoke all on vq_fixture.age_states from public,anon;

CREATE OR REPLACE FUNCTION public.nba_name_key(n text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
 select nullif(trim(regexp_replace(regexp_replace(regexp_replace(
  lower(translate(n, 'áàâäãåāÁÀÂÄÃÅĀčćçČĆÇďĎéèêëěēÉÈÊËĚĒíìîïīÍÌÎÏĪľłĽŁñńňÑŃŇóòôöõøōÓÒÔÖÕØŌřŘšśşŠŚŞťŤúùûüůūÚÙÛÜŮŪýÿÝŸžźżŽŹŻ',
   'aaaaaaaaaaaaaaccccccddeeeeeeeeeeeeiiiiiiiiiillllnnnnnnoooooooooooooorrssssssttuuuuuuuuuuuuyyyyzzzzzz')),
  '[^a-z ]', '', 'g'), '\m(jr|sr|ii|iii|iv)\M', '', 'g'), '\s+', ' ', 'g')), '')
$function$
;

revoke all on function public.nba_name_key(text) from public,anon,authenticated,service_role;

create table public.alert_preferences (
 "user_id" uuid not null,
 "scope" text default 'all'::text not null
);

revoke all on public.alert_preferences from public,anon,authenticated,service_role;

create table public.app_update_reads (
 "user_id" uuid not null,
 "update_id" uuid not null,
 "read_at" timestamp with time zone default now() not null
);

revoke all on public.app_update_reads from public,anon,authenticated,service_role;

create table public.app_updates (
 "id" uuid default gen_random_uuid() not null,
 "title" text not null,
 "body" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.app_updates from public,anon,authenticated,service_role;

create table public.audit_events (
 "id" uuid default gen_random_uuid() not null,
 "entity" text not null,
 "entity_id" uuid not null,
 "action" text not null,
 "detail" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.audit_events from public,anon,authenticated,service_role;

create table public.bankroll_transactions (
 "id" uuid default gen_random_uuid() not null,
 "challenge_id" uuid not null,
 "pick_id" uuid,
 "kind" text not null,
 "amount_cents" integer not null,
 "balance_cents" integer not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.bankroll_transactions from public,anon,authenticated,service_role;

create table public.candidate_releases (
 "id" uuid default gen_random_uuid() not null,
 "stage_id" uuid not null,
 "title" text not null,
 "candidates" jsonb not null,
 "expires_at" timestamp with time zone not null,
 "created_at" timestamp with time zone default now() not null,
 "publication_key" text not null
);

revoke all on public.candidate_releases from public,anon,authenticated,service_role;

create table public.challenge_checkins (
 "user_id" uuid not null,
 "challenge_id" uuid not null,
 "stage_number" integer not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.challenge_checkins from public,anon,authenticated,service_role;

create table public.challenge_runs (
 "user_id" uuid not null,
 "challenge_id" uuid not null,
 "mode" text not null,
 "count_me" boolean default false not null,
 "joined_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.challenge_runs from public,anon,authenticated,service_role;

create table public.challenge_stages (
 "id" uuid default gen_random_uuid() not null,
 "challenge_id" uuid not null,
 "stage_number" integer not null,
 "slot" text not null,
 "game_id" uuid,
 "status" text default 'PREP'::text not null,
 "pass_reason" text
);

revoke all on public.challenge_stages from public,anon,authenticated,service_role;

create table public.challenges (
 "id" uuid default gen_random_uuid() not null,
 "number" integer generated always as identity not null,
 "name" text default 'The 5-Spot Challenge'::text not null,
 "starting_cents" integer default 2000 not null,
 "target_cents" integer default 64000 not null,
 "balance_cents" integer default 2000 not null,
 "status" text default 'PREP'::text not null,
 "current_stage" integer default 1 not null,
 "pause_reason" text,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.challenges from public,anon,authenticated,service_role;

create table public.closing_lines (
 "id" uuid default gen_random_uuid() not null,
 "pick_id" uuid not null,
 "line" numeric,
 "odds" numeric not null,
 "source" text not null,
 "observed_at" timestamp with time zone not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.closing_lines from public,anon,authenticated,service_role;

create table public.community_comment_reactions (
 "comment_id" uuid not null,
 "user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_comment_reactions from public,anon,authenticated,service_role;

create table public.community_poll_votes (
 "post_id" uuid not null,
 "user_id" uuid not null,
 "option_index" smallint not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_poll_votes from public,anon,authenticated,service_role;

create table public.community_polls (
 "post_id" uuid not null,
 "question" text not null,
 "options" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_polls from public,anon,authenticated,service_role;

create table public.community_post_comments (
 "id" uuid default gen_random_uuid() not null,
 "post_id" uuid not null,
 "user_id" uuid not null,
 "author_name" text default ''::text not null,
 "body" text not null,
 "created_at" timestamp with time zone default now() not null,
 "parent_id" uuid
);

revoke all on public.community_post_comments from public,anon,authenticated,service_role;

create table public.community_post_votes (
 "post_id" uuid not null,
 "user_id" uuid not null,
 "value" smallint not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_post_votes from public,anon,authenticated,service_role;

create table public.community_posts (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "sport" text not null,
 "kind" text not null,
 "title" text not null,
 "body" text not null,
 "legs" jsonb default '[]'::jsonb not null,
 "stake" numeric(12,2),
 "author_name" text default ''::text not null,
 "created_at" timestamp with time zone default now() not null,
 "photo_path" text,
 "card" text
);

revoke all on public.community_posts from public,anon,authenticated,service_role;

create table public.community_profiles (
 "user_id" uuid not null,
 "username" text not null,
 "region" text default ''::text not null,
 "avatar" text,
 "visible" boolean default false not null,
 "updated_at" timestamp with time zone default now() not null,
 "instagram_url" text,
 "x_url" text,
 "tagline" text default ''::text not null,
 "bio" text default ''::text not null,
 "state" text default ''::text not null
);

revoke all on public.community_profiles from public,anon,authenticated,service_role;

create table public.community_reactions (
 "post_id" uuid not null,
 "user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null,
 "reaction_type" text default 'heart'::text not null
);

revoke all on public.community_reactions from public,anon,authenticated,service_role;

create table public.community_reports (
 "id" uuid default gen_random_uuid() not null,
 "post_id" uuid not null,
 "user_id" uuid not null,
 "reason" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_reports from public,anon,authenticated,service_role;

create table public.community_shares (
 "post_id" uuid not null,
 "user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.community_shares from public,anon,authenticated,service_role;

create table public.edge_releases (
 "id" uuid default gen_random_uuid() not null,
 "official_pick_id" uuid not null,
 "items" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.edge_releases from public,anon,authenticated,service_role;

create table public.intelligence_markets (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "market_key" text not null,
 "label" text not null,
 "market_type" text not null,
 "selection" text not null,
 "opposite" text not null,
 "period" text default 'Full game'::text not null,
 "rules" text not null,
 "official_pick_id" uuid,
 "created_at" timestamp with time zone default now() not null,
 "created_by" uuid default auth.uid()
);

revoke all on public.intelligence_markets from public,anon,authenticated,service_role;

create table public.intelligence_models (
 "id" uuid default gen_random_uuid() not null,
 "market_id" uuid not null,
 "true_line" numeric,
 "projection" text not null,
 "probability" numeric,
 "probability_line" numeric,
 "sharp_fair_line" numeric,
 "sharp_method" text,
 "observed_at" timestamp with time zone not null,
 "source" text not null,
 "notes" text default ''::text not null,
 "created_at" timestamp with time zone default now() not null,
 "created_by" uuid default auth.uid()
);

revoke all on public.intelligence_models from public,anon,authenticated,service_role;

create table public.intelligence_news (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "category" text not null,
 "headline" text not null,
 "body" text not null,
 "observed_at" timestamp with time zone not null,
 "time_basis" text default 'published'::text not null,
 "source" text not null,
 "created_at" timestamp with time zone default now() not null,
 "created_by" uuid default auth.uid()
);

revoke all on public.intelligence_news from public,anon,authenticated,service_role;

create table public.intelligence_quotes (
 "id" uuid default gen_random_uuid() not null,
 "market_id" uuid not null,
 "book" text not null,
 "line" numeric,
 "odds" numeric not null,
 "opposite_odds" numeric,
 "observed_at" timestamp with time zone not null,
 "time_basis" text default 'observed'::text not null,
 "source" text not null,
 "notes" text default ''::text not null,
 "created_at" timestamp with time zone default now() not null,
 "created_by" uuid default auth.uid()
);

revoke all on public.intelligence_quotes from public,anon,authenticated,service_role;

create table public.leg_book_prices (
 "leg_key" text not null,
 "book" text not null,
 "price" numeric not null,
 "point" numeric not null,
 "observed_at" timestamp with time zone not null,
 "kickoff" timestamp with time zone not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.leg_book_prices from public,anon,authenticated,service_role;

create table public.leg_history (
 "leg_key" text not null,
 "player_id" text,
 "position" text,
 "games" jsonb not null,
 "cleared" integer not null,
 "sample" integer not null,
 "median" numeric,
 "computed_at" timestamp with time zone default now() not null
);

revoke all on public.leg_history from public,anon,authenticated,service_role;

create table public.leg_market_prices (
 "leg_key" text not null,
 "book" text not null,
 "first_price" numeric not null,
 "first_point" numeric not null,
 "first_observed_at" timestamp with time zone not null,
 "last_price" numeric not null,
 "last_point" numeric not null,
 "last_observed_at" timestamp with time zone not null,
 "kickoff" timestamp with time zone not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.leg_market_prices from public,anon,authenticated,service_role;

create table public.leg_result_progress (
 "leg_key" text not null,
 "status" text not null,
 "value" numeric,
 "reason" text not null,
 "source_url" text not null,
 "checked_at" timestamp with time zone default now() not null
);

revoke all on public.leg_result_progress from public,anon,authenticated,service_role;

create table public.leg_tails (
 "user_id" uuid not null,
 "leg_key" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.leg_tails from public,anon,authenticated,service_role;

create table public.member_blocks (
 "user_id" uuid not null,
 "target_user_id" uuid not null,
 "label" text default 'Member'::text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.member_blocks from public,anon,authenticated,service_role;

create table public.member_follows (
 "user_id" uuid not null,
 "target_user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.member_follows from public,anon,authenticated,service_role;

create table public.member_parlays (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "title" text not null,
 "leg_keys" text[] not null,
 "legs" jsonb not null,
 "created_at" timestamp with time zone default now() not null,
 "expires_at" timestamp with time zone not null,
 "community_post_id" uuid
);

revoke all on public.member_parlays from public,anon,authenticated,service_role;

create table public.nba_editorial_picks (
 "id" uuid default gen_random_uuid() not null,
 "publication_key" text not null,
 "game_id" uuid not null,
 "quote_observation_id" uuid not null,
 "player" text not null,
 "market" text not null,
 "direction" text not null,
 "line" numeric not null,
 "odds" integer not null,
 "book" text not null,
 "analysis_kind" text default 'QUALITATIVE_EDITORIAL'::text not null,
 "rationale" text not null,
 "risk" text not null,
 "unknowns" text not null,
 "sources" jsonb not null,
 "evidence" jsonb not null,
 "supersedes_id" uuid,
 "published_at" timestamp with time zone default now() not null,
 "expires_at" timestamp with time zone not null,
 "quote_observed_at" timestamp with time zone not null,
 "quote_recorded_at" timestamp with time zone not null,
 "quote_source_url" text not null
);

revoke all on public.nba_editorial_picks from public,anon,authenticated,service_role;

create table public.nba_game_results (
 "game_id" uuid not null,
 "provider_id" text not null,
 "away_score" integer not null,
 "home_score" integer not null,
 "overtime" boolean default false not null,
 "fingerprint" text not null,
 "source_url" text not null,
 "source_hash" text not null,
 "first_final_at" timestamp with time zone not null,
 "recorded_at" timestamp with time zone default now() not null
);

revoke all on public.nba_game_results from public,anon,authenticated,service_role;

create table public.nba_player_results (
 "game_id" uuid not null,
 "athlete_id" text not null,
 "player" text not null,
 "name_key" text generated always as (nba_name_key(player)) stored,
 "team" text not null,
 "side" text not null,
 "played" boolean not null,
 "minutes" integer,
 "points" integer not null,
 "rebounds" integer not null,
 "assists" integer not null,
 "threes" integer not null,
 "steals" integer not null,
 "blocks" integer not null,
 "turnovers" integer not null,
 "starter" boolean,
 "position" text
);

revoke all on public.nba_player_results from public,anon,authenticated,service_role;

create table public.nba_player_shooting (
 "game_id" uuid not null,
 "athlete_id" text not null,
 "fgm" integer not null,
 "fga" integer not null,
 "ftm" integer not null,
 "fta" integer not null,
 "recorded_at" timestamp with time zone default now() not null
);

revoke all on public.nba_player_shooting from public,anon,authenticated,service_role;

create table public.nba_player_three_attempts (
 "game_id" uuid not null,
 "athlete_id" text not null,
 "attempts" integer not null,
 "recorded_at" timestamp with time zone default now() not null
);

revoke all on public.nba_player_three_attempts from public,anon,authenticated,service_role;

create table public.nba_result_progress (
 "game_id" uuid not null,
 "status" text not null,
 "reason" text not null,
 "checked_at" timestamp with time zone default now() not null
);

revoke all on public.nba_result_progress from public,anon,authenticated,service_role;

create table public.nfl_analyst_double_ups (
 "id" uuid not null,
 "day" date default ((now() AT TIME ZONE 'America/New_York'::text))::date not null,
 "title" text not null,
 "candidates" jsonb not null,
 "sportsbook" text not null,
 "combined_odds" integer not null,
 "quote_observation_id" uuid not null,
 "source_url" text not null,
 "observed_at" timestamp with time zone not null,
 "expires_at" timestamp with time zone not null,
 "review" jsonb not null,
 "policy_version" text default '2026-10-25.analyst-double-up'::text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.nfl_analyst_double_ups from public,anon,authenticated,service_role;

create table public.notification_preferences (
 "user_id" uuid not null,
 "disabled_types" text[] default '{}'::text[] not null,
 "push_enabled" boolean default false not null,
 "email_enabled" boolean default false not null,
 "sound_enabled" boolean default false not null,
 "haptics_enabled" boolean default false not null,
 "batch_minutes" integer default 5 not null,
 "timezone" text default 'America/New_York'::text not null,
 "quiet_enabled" boolean default false not null,
 "quiet_start" integer default 22 not null,
 "quiet_end" integer default 8 not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.notification_preferences from public,anon,authenticated,service_role;

create table public.notifications (
 "id" uuid default gen_random_uuid() not null,
 "recipient_id" uuid not null,
 "actor_id" uuid,
 "actor_name" text not null,
 "actor_avatar" text,
 "type" text not null,
 "content_id" uuid,
 "post_id" uuid,
 "comment_id" uuid,
 "message" text not null,
 "priority" text not null,
 "deep_link" text not null,
 "group_key" text not null,
 "event_count" integer default 1 not null,
 "actor_names" text[] default '{}'::text[] not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null,
 "read_at" timestamp with time zone,
 "viewed_at" timestamp with time zone
);

revoke all on public.notifications from public,anon,authenticated,service_role;

create table public.official_picks (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "stage_id" uuid,
 "analysis_id" uuid not null,
 "market" text not null,
 "selection" text not null,
 "recommended_line" numeric,
 "direction" text,
 "odds" numeric not null,
 "stake_cents" integer not null,
 "model_probability" numeric not null,
 "market_probability" numeric not null,
 "edge" numeric not null,
 "confidence" numeric not null,
 "risk" numeric not null,
 "predicted_close" text not null,
 "best_number" text not null,
 "bet_grade" text not null,
 "fear_index" numeric not null,
 "timing" text not null,
 "why_like" text not null,
 "why_lose" text not null,
 "playable_number" text not null,
 "pass_number" text not null,
 "book" text not null,
 "raw_handoff" text not null,
 "known_at_publication" jsonb not null,
 "created_at" timestamp with time zone default now() not null,
 "market_info_url" text,
 "gambly_url" text,
 "rule_ids" text[] default '{}'::text[] not null
);

revoke all on public.official_picks from public,anon,authenticated,service_role;

create table public.onboarding_events (
 "user_id" uuid not null,
 "event" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.onboarding_events from public,anon,authenticated,service_role;

create table public.personal_challenges (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "challenge_id" uuid not null,
 "starting_cents" integer not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_challenges from public,anon,authenticated,service_role;

create table public.personal_correction_decisions (
 "id" uuid default gen_random_uuid() not null,
 "sequence" bigint generated always as identity not null,
 "request_id" uuid not null,
 "entry_id" uuid not null,
 "user_id" uuid not null,
 "admin_id" uuid not null,
 "approved" boolean not null,
 "snapshot" jsonb not null,
 "result_override" text,
 "note" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_correction_decisions from public,anon,authenticated,service_role;

create table public.personal_correction_requests (
 "id" uuid default gen_random_uuid() not null,
 "entry_id" uuid not null,
 "user_id" uuid not null,
 "proposed" jsonb not null,
 "reason" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_correction_requests from public,anon,authenticated,service_role;

create table public.personal_entries (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "personal_challenge_id" uuid not null,
 "pick_id" uuid not null,
 "line" numeric,
 "odds" numeric not null,
 "stake_cents" integer not null,
 "payout_cents" integer not null,
 "book" text not null,
 "placed_at" timestamp with time zone not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_entries from public,anon,authenticated,service_role;

create table public.personal_run_events (
 "id" bigint generated always as identity not null,
 "personal_challenge_id" uuid not null,
 "user_id" uuid default auth.uid() not null,
 "payout_pending" boolean not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_run_events from public,anon,authenticated,service_role;

create table public.personal_settlements (
 "id" uuid default gen_random_uuid() not null,
 "entry_id" uuid not null,
 "user_id" uuid not null,
 "result" text not null,
 "profit_cents" integer not null,
 "source" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.personal_settlements from public,anon,authenticated,service_role;

create table public.pick_entries (
 "id" uuid default gen_random_uuid() not null,
 "pick_id" uuid not null,
 "line" numeric,
 "odds" numeric not null,
 "source" text not null,
 "bet_at" timestamp with time zone,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.pick_entries from public,anon,authenticated,service_role;

create table public.pick_results (
 "id" uuid default gen_random_uuid() not null,
 "pick_id" uuid not null,
 "result" text not null,
 "away_score" integer,
 "home_score" integer,
 "profit_cents" integer not null,
 "bankroll_cents" integer,
 "source" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.pick_results from public,anon,authenticated,service_role;

create table private.account_erasure_jobs (
 "user_id" uuid not null,
 "lease_id" uuid default gen_random_uuid() not null,
 "ready" boolean default false not null,
 "expires_at" timestamp with time zone default (now() + '00:10:00'::interval) not null
);

revoke all on private.account_erasure_jobs from public,anon,authenticated,service_role;

create table private.admin_users (
 "user_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.admin_users from public,anon,authenticated,service_role;

create table private.community_restrictions (
 "user_id" uuid not null,
 "reason" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.community_restrictions from public,anon,authenticated,service_role;

create table private.editorial_parlay_results (
 "leg_key" text not null,
 "leaf_results" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.editorial_parlay_results from public,anon,authenticated,service_role;

create table private.leg_move_alerts (
 "leg_key" text not null,
 "direction" text not null,
 "from_price" numeric not null,
 "to_price" numeric not null,
 "alerted_at" timestamp with time zone default now() not null
);

revoke all on private.leg_move_alerts from public,anon,authenticated,service_role;

create table private.leg_result_contracts (
 "leg_key" text not null,
 "game_id" uuid not null,
 "player" text not null,
 "team" text not null,
 "metric" text not null,
 "threshold" numeric not null,
 "operator" text not null,
 "period" text not null,
 "market" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.leg_result_contracts from public,anon,authenticated,service_role;

create table private.leg_result_evidence (
 "leg_key" text not null,
 "value" numeric not null,
 "espn" jsonb not null,
 "nflverse" jsonb not null,
 "verified_at" timestamp with time zone default now() not null
);

revoke all on private.leg_result_evidence from public,anon,authenticated,service_role;

create table private.live_pick_alerts (
 "pick_id" uuid not null,
 "sport" text not null,
 "message" text not null,
 "recipients" integer default 0 not null,
 "created_at" timestamp with time zone default now() not null,
 "zone_post_id" uuid,
 "zone_status" text,
 "zone_attempts" integer default 0 not null,
 "zone_next_attempt_at" timestamp with time zone,
 "zone_attempted_at" timestamp with time zone,
 "zone_last_error" text
);

revoke all on private.live_pick_alerts from public,anon,authenticated,service_role;

create table private.memberships (
 "id" uuid default gen_random_uuid() not null,
 "user_id" uuid not null,
 "season" text not null,
 "plan" text not null,
 "starts_at" timestamp with time zone default now() not null,
 "expires_at" timestamp with time zone not null,
 "revoked_at" timestamp with time zone,
 "order_id" uuid,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.memberships from public,anon,authenticated,service_role;

create table private.nba_result_corrections (
 "id" bigint generated always as identity not null,
 "game_id" uuid not null,
 "recorded_fingerprint" text not null,
 "observed_fingerprint" text not null,
 "observed" jsonb not null,
 "source_hash" text not null,
 "detected_at" timestamp with time zone default now() not null
);

revoke all on private.nba_result_corrections from public,anon,authenticated,service_role;

create table private.nba_result_staging (
 "game_id" uuid not null,
 "fingerprint" text not null,
 "first_seen_at" timestamp with time zone default now() not null,
 "last_seen_at" timestamp with time zone default now() not null
);

revoke all on private.nba_result_staging from public,anon,authenticated,service_role;

create table private.nba_threes_posts (
 "day" date not null,
 "status" text not null,
 "post_id" uuid,
 "detail" text,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on private.nba_threes_posts from public,anon,authenticated,service_role;

create table private.nfl_selection_gate_decisions (
 "id" uuid default gen_random_uuid() not null,
 "created_at" timestamp with time zone default now() not null,
 "version" text not null,
 "entity" text not null,
 "entity_id" uuid,
 "accepted" boolean not null,
 "errors" jsonb not null,
 "evidence" jsonb not null
);

revoke all on private.nfl_selection_gate_decisions from public,anon,authenticated,service_role;

create table private.nfl_selection_identities (
 "identity" text not null,
 "entity" text not null,
 "entity_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.nfl_selection_identities from public,anon,authenticated,service_role;

create table private.nfl_selection_model_approvals (
 "model_id" text not null,
 "markets" text[] not null,
 "validation_url" text not null,
 "approved_at" timestamp with time zone default now() not null,
 "phases" text[] default ARRAY['pregame'::text] not null,
 "positions" text[] default ARRAY['RB'::text, 'WR'::text, 'TE'::text] not null,
 "line_min" numeric default 20.5 not null,
 "line_max" numeric default 100.5 not null,
 "odds_min" numeric default '-249'::integer not null,
 "odds_max" numeric default '-150'::integer not null
);

revoke all on private.nfl_selection_model_approvals from public,anon,authenticated,service_role;

create table private.nfl_selection_rule_versions (
 "version" text not null,
 "effective_at" timestamp with time zone default now() not null,
 "rules" jsonb not null,
 "source" text not null
);

revoke all on private.nfl_selection_rule_versions from public,anon,authenticated,service_role;

create table private.nhl_chart_snapshots (
 "id" uuid not null,
 "game_id" uuid not null,
 "day" date not null,
 "payload" jsonb not null,
 "captured_at" timestamp with time zone default clock_timestamp() not null,
 "post_id" uuid,
 "posted_at" timestamp with time zone
);

revoke all on private.nhl_chart_snapshots from public,anon,authenticated,service_role;

create table private.notification_action_rates (
 "user_id" uuid not null,
 "window_at" timestamp with time zone not null,
 "attempts" integer not null
);

revoke all on private.notification_action_rates from public,anon,authenticated,service_role;

create table private.notification_events (
 "recipient_id" uuid not null,
 "event_key" text not null,
 "type" text not null,
 "actor_id" uuid,
 "notification_id" uuid,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.notification_events from public,anon,authenticated,service_role;

create table private.notification_presence (
 "user_id" uuid not null,
 "device" uuid not null,
 "last_seen" timestamp with time zone default now() not null,
 "visible" boolean default true not null
);

revoke all on private.notification_presence from public,anon,authenticated,service_role;

create table private.publish_receipts (
 "request_id" uuid not null,
 "action" text not null,
 "response" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.publish_receipts from public,anon,authenticated,service_role;

create table private.research_identities (
 "identity" text not null,
 "release_id" uuid not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.research_identities from public,anon,authenticated,service_role;

create table private.sports_sources (
 "id" uuid default gen_random_uuid() not null,
 "url" text not null,
 "sha256" text not null,
 "retrieved_at" timestamp with time zone not null,
 "body" text not null
);

revoke all on private.sports_sources from public,anon,authenticated,service_role;

create table private.weekly_sleeper_reviews (
 "release_id" uuid not null,
 "policy_version" text default '2026-10-25.sleeper'::text not null,
 "evidence" jsonb not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on private.weekly_sleeper_reviews from public,anon,authenticated,service_role;

create table private.zone_post_games (
 "post_id" uuid not null,
 "game_id" uuid not null,
 "sport" text not null,
 "tagged_at" timestamp with time zone default now() not null
);

revoke all on private.zone_post_games from public,anon,authenticated,service_role;

create table public.process_reviews (
 "id" uuid default gen_random_uuid() not null,
 "pick_id" uuid not null,
 "grade" text not null,
 "classification" text not null,
 "lessons" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.process_reviews from public,anon,authenticated,service_role;

create table public.research_leg_results (
 "leg_key" text not null,
 "result" text not null,
 "source_url" text not null,
 "verified_at" timestamp with time zone default now() not null
);

revoke all on public.research_leg_results from public,anon,authenticated,service_role;

create table public.ruby_card_comments (
 "id" uuid default gen_random_uuid() not null,
 "card_id" uuid not null,
 "user_id" uuid not null,
 "parent_id" uuid,
 "author_name" text not null,
 "body" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.ruby_card_comments from public,anon,authenticated,service_role;

create table public.ruby_card_revisions (
 "id" uuid not null,
 "user_id" uuid not null,
 "brand" text not null,
 "theme" text not null,
 "submission_day" date default ((now() AT TIME ZONE 'America/New_York'::text))::date not null,
 "sport" text not null,
 "title" text not null,
 "legs" jsonb default '[]'::jsonb not null,
 "note" text default ''::text not null,
 "photo_path" text,
 "sportsbook" text,
 "reported_odds" integer,
 "created_at" timestamp with time zone default now() not null,
 "submission_id" uuid not null,
 "revision" integer not null,
 "edited_by" uuid,
 "source_link" text
);

revoke all on public.ruby_card_revisions from public,anon,authenticated,service_role;

create table public.ruby_contributors (
 "user_id" uuid not null,
 "brand" text not null,
 "theme" text not null,
 "active" boolean default true not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.ruby_contributors from public,anon,authenticated,service_role;

create table public.ruby_daily_features (
 "day" date default ((now() AT TIME ZONE 'America/New_York'::text))::date not null,
 "submission_id" uuid,
 "verified_odds" integer not null,
 "sportsbook" text not null,
 "source_url" text not null,
 "observed_at" timestamp with time zone not null,
 "verified_by" uuid,
 "created_at" timestamp with time zone default now() not null,
 "analyst_ticket_id" uuid
);

revoke all on public.ruby_daily_features from public,anon,authenticated,service_role;

create table public.ruby_result_reports (
 "id" uuid default gen_random_uuid() not null,
 "submission_id" uuid not null,
 "revision" integer not null,
 "outcome" text not null,
 "reported_by" uuid,
 "reported_at" timestamp with time zone default now() not null
);

revoke all on public.ruby_result_reports from public,anon,authenticated,service_role;

create table public.ruby_submissions (
 "id" uuid not null,
 "user_id" uuid not null,
 "brand" text not null,
 "theme" text not null,
 "submission_day" date default ((now() AT TIME ZONE 'America/New_York'::text))::date not null,
 "sport" text not null,
 "title" text not null,
 "legs" jsonb default '[]'::jsonb not null,
 "note" text default ''::text not null,
 "photo_path" text,
 "sportsbook" text,
 "reported_odds" integer,
 "created_at" timestamp with time zone default now() not null,
 "source_link" text
);

revoke all on public.ruby_submissions from public,anon,authenticated,service_role;

create table public.ruby_visibility_events (
 "id" uuid default gen_random_uuid() not null,
 "submission_id" uuid not null,
 "hidden" boolean not null,
 "changed_by" uuid,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.ruby_visibility_events from public,anon,authenticated,service_role;

create table public.saved_legs (
 "user_id" uuid not null,
 "leg_key" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.saved_legs from public,anon,authenticated,service_role;

create table public.sports_games (
 "id" uuid default gen_random_uuid() not null,
 "sport" text not null,
 "provider_id" text not null,
 "slug" text not null,
 "start_time" timestamp with time zone not null,
 "payload" jsonb not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.sports_games from public,anon,authenticated,service_role;

create table public.sports_markets (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "source_id" uuid not null,
 "fingerprint" text not null,
 "observed_at" timestamp with time zone not null,
 "expires_at" timestamp with time zone not null,
 "payload" jsonb not null
);

revoke all on public.sports_markets from public,anon,authenticated,service_role;

create table public.sports_selections (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "market_id" uuid not null,
 "title" text not null,
 "why" text not null,
 "risk" text not null,
 "author_id" uuid not null,
 "published_at" timestamp with time zone default now() not null,
 "expires_at" timestamp with time zone not null,
 "sources" jsonb not null,
 "classification" text default 'QUALITATIVE_EDITORIAL'::text not null
);

revoke all on public.sports_selections from public,anon,authenticated,service_role;

create table public.target_legs (
 "id" uuid default gen_random_uuid() not null,
 "game_id" uuid not null,
 "analysis_version_id" uuid not null,
 "market_type" text not null,
 "player_name" text,
 "selection" text not null,
 "current_number" text,
 "current_odds" numeric,
 "target_number" text,
 "playable_number" text,
 "pass_number" text,
 "model_probability" numeric,
 "market_probability" numeric,
 "edge" numeric,
 "estimated_ev" text,
 "confidence" numeric,
 "risk" numeric,
 "predicted_close" text,
 "status" text not null,
 "why_we_like_it" text,
 "what_we_are_waiting_for" text,
 "why_it_could_lose" text,
 "rank" integer,
 "official_pick_id" uuid,
 "promoted_to_official" boolean default false not null,
 "created_at" timestamp with time zone default now() not null,
 "updated_at" timestamp with time zone default now() not null
);

revoke all on public.target_legs from public,anon,authenticated,service_role;

create table public.topic_follows (
 "user_id" uuid not null,
 "kind" text not null,
 "topic" text not null,
 "created_at" timestamp with time zone default now() not null
);

revoke all on public.topic_follows from public,anon,authenticated,service_role;

set local check_function_bodies=false;

CREATE OR REPLACE FUNCTION private.audit_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ begin insert into public.audit_events(entity,entity_id,action,detail) values(tg_table_name,new.id,tg_op,jsonb_build_object('after',to_jsonb(new),'before',case when tg_op='UPDATE' then to_jsonb(old) else null end)); return new; end $function$
;

revoke all on function private.audit_change() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.before_age_community_member(p_username text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.community_profiles; events jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view member profiles'; end if;
 select cp.* into p from public.community_profiles cp join auth.users u on u.id=cp.user_id
 where lower(cp.username)=lower(p_username) and (cp.user_id=auth.uid() or (cp.visible))
 and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<=now());
 if not found then return null; end if;
 select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into events from (
 select * from (
 select 'joined' as kind,c.number as challenge_number,null::integer as stage_number,r.joined_at as at
 from public.challenge_runs r join public.challenges c on c.id=r.challenge_id where r.user_id=p.user_id
 union all
 select 'followed',c.number,k.stage_number,k.created_at from public.challenge_checkins k join public.challenges c on c.id=k.challenge_id where k.user_id=p.user_id
 union all
 select 'won',c.number,st.stage_number,max(pr.created_at) from public.personal_entry_state e
 join public.official_picks op on op.id=e.pick_id join public.challenge_stages st on st.id=op.stage_id
 join public.challenges c on c.id=st.challenge_id
 join public.pick_results pr on pr.pick_id=op.id
 where e.user_id=p.user_id and e.result='WIN'
 group by c.number,st.stage_number
 ) x order by at desc limit 100
 ) e;
 return jsonb_build_object('username',p.username,'region',p.region,'avatar',p.avatar,'instagram_url',p.instagram_url,'x_url',p.x_url,'events',events);
end $function$
;

revoke all on function private.before_age_community_member(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.before_age_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(auth.jwt()->>'aal','aal1')='aal2' and exists(select 1 from private.admin_users where user_id=(select auth.uid()));
$function$
;

revoke all on function private.before_age_is_admin() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_edge_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g public.games; extras jsonb; top_pick jsonb;
begin
 if new.stage_id is null or new.edge<3 then return new; end if;
 select * into g from public.games where id=new.game_id;
 top_pick:=jsonb_build_object('selection',new.selection,'odds',new.odds,'edge',new.edge,'model_probability',new.model_probability,'market_probability',new.market_probability,'confidence',new.confidence,'why_like',new.why_like,'why_lose',new.why_lose,'playable_number',new.playable_number,'pass_number',new.pass_number,'game_id',g.id,'slug',g.slug,'matchup',g.away_team||' @ '||g.home_team,'kickoff',g.kickoff,'source_at',new.created_at,'role','Challenge pick');
 select coalesce(jsonb_agg(x.item order by x.rank nulls last,x.edge desc,x.id),'[]'::jsonb) into extras from (
  select distinct on (t.game_id,t.selection) t.id,t.rank,t.edge,
   jsonb_build_object('selection',t.selection,'number',t.current_number,'odds',t.current_odds,'edge',t.edge,'model_probability',t.model_probability,'market_probability',t.market_probability,'confidence',t.confidence,'why_like',t.why_we_like_it,'why_lose',t.why_it_could_lose,'playable_number',t.playable_number,'pass_number',t.pass_number,'game_id',tg.id,'slug',tg.slug,'matchup',tg.away_team||' @ '||tg.home_team,'kickoff',tg.kickoff,'source_at',t.created_at,'target_id',t.id,'role','Additional edge') item
  from public.target_legs t join public.games tg on tg.id=t.game_id
  where t.status='BETTABLE' and t.edge>=3 and t.current_odds is not null and t.current_number is not null
   and t.model_probability is not null and t.market_probability is not null and t.confidence is not null
   and t.created_at<=new.created_at and tg.kickoff>new.created_at and tg.slot=g.slot
   and (tg.kickoff at time zone 'America/New_York')::date=(g.kickoff at time zone 'America/New_York')::date
   and not(t.game_id=new.game_id and lower(trim(t.selection))=lower(trim(new.selection)))
   and t.analysis_version_id=(select a.id from public.analysis_versions a where a.game_id=t.game_id and a.created_at<=new.created_at order by a.version desc limit 1)
  order by t.game_id,t.selection,t.created_at desc
 ) x;
 select coalesce(jsonb_agg(value),'[]'::jsonb) into extras from (select value from jsonb_array_elements(extras) limit 2) limited;
 insert into public.edge_releases(official_pick_id,items,created_at) values(new.id,jsonb_build_array(top_pick)||extras,new.created_at);
 return new;
end $function$
;

revoke all on function private.capture_edge_release() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.cite_bible_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  game_sport text;
begin
  if cardinality(new.rule_ids) = 0 then
    select coalesce(array_agg(q.id order by q.first_at), '{}') into new.rule_ids
    from (
      select m[1] as id, min(x.ord) as first_at
      from regexp_matches(coalesce(new.why_like, '') || ' ' || coalesce(new.why_lose, ''),
                          '\m(R-(?:0[1-9]|[1-3][0-9]|40))\M', 'g') with ordinality as x(m, ord)
      group by m[1]
    ) q;
  end if;
  select g.sport into game_sport from public.games g where g.id = new.game_id;
  if game_sport = 'nba' and cardinality(new.rule_ids) = 0 then
    raise exception 'NBA picks must cite at least one NBA Betting Bible rule (R-01 to R-40) in the case or the risks';
  end if;
  return new;
end $function$
;

revoke all on function private.cite_bible_rules() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_activity()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.post_id desc) from (
  select latest.id as post_id,cp.username,cp.avatar,latest.sport,latest.created_at
  from public.community_profiles cp
  join auth.users u on u.id=cp.user_id
  cross join lateral (
   select p.id,p.sport,p.created_at from public.community_posts p
   where p.user_id=cp.user_id
   order by p.created_at desc,p.id desc limit 1
  ) latest
  where cp.visible and u.email_confirmed_at is not null
  and (u.banned_until is null or u.banned_until<=now())
  and private.community_member_allowed(cp.user_id)
  order by latest.created_at desc,latest.id desc limit 24
 ) x),'[]'::jsonb);
end $function$
;

revoke all on function private.community_activity() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_follow_target_allowed(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (
  select 1 from public.community_profiles cp join auth.users u on u.id = cp.user_id
  where cp.user_id = target and cp.visible
   and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
        )
 ) and coalesce(private.community_member_allowed(target), false)
$function$
;

revoke all on function private.community_follow_target_allowed(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_member_allowed(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and not exists(select 1 from public.member_blocks b where (b.user_id=auth.uid() and b.target_user_id=target) or (b.target_user_id=auth.uid() and b.user_id=target))
$function$
;

revoke all on function private.community_member_allowed(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_photo_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and private.age_member_allowed()
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 and exists(select 1 from public.community_profiles p where p.user_id=auth.uid() and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$')
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$function$
;

revoke all on function private.community_photo_access() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_reaction_actor_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and coalesce(private.age_member_allowed(),false)
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$function$
;

revoke all on function private.community_reaction_actor_allowed() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.community_safety_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare text_content text; target uuid;begin
 if auth.uid() is null or new.user_id<>auth.uid() then raise exception 'Sign in as the author';end if;
 if exists(select 1 from private.community_restrictions r where r.user_id=auth.uid()) then raise exception 'Community posting restricted; use Help & Support';end if;
 if TG_TABLE_NAME='community_posts' then text_content=new.title||' '||new.body||' '||new.legs::text;
 elsif TG_TABLE_NAME in ('community_post_comments','game_comments') then text_content=new.body;
 else text_content='';end if;
 if text_content ~* '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then raise exception 'Remove harmful content, executable links or guaranteed-return claims';end if;
 if TG_TABLE_NAME in ('community_post_comments','community_reactions','community_reports') then
  select user_id into target from public.community_posts where id=new.post_id;
  if target is null or not private.community_member_allowed(target) then raise exception 'Post unavailable';end if;
 elsif TG_TABLE_NAME='member_follows' then
  if not private.community_member_allowed(new.target_user_id) then raise exception 'Member unavailable';end if;
 end if;
 return new;
end $function$
;

revoke all on function private.community_safety_check() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.complete_editorial_parlay()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ticket record;n integer;wins integer;losses integer;sources text[];facts jsonb;outcome text;begin
 for ticket in select 'candidate:'||r.id::text||':'||c.ordinality::text leg_key,c.value
 from public.candidate_releases r cross join lateral jsonb_array_elements(r.candidates)with ordinality c(value,ordinality)
 where c.value->>'parlay'='true' and c.value->'leg_keys' ? new.leg_key loop
 perform pg_advisory_xact_lock(hashtextextended(ticket.leg_key,0));
 if exists(select 1 from public.research_leg_results where leg_key=ticket.leg_key)then continue;end if;
 if jsonb_array_length(ticket.value->'leg_keys')not between 2 and 12 then continue;end if;
 select count(*),count(*)filter(where result='WIN'),count(*)filter(where result='LOSS'),array_agg(source_url),jsonb_agg(jsonb_build_object('leg_key',r.leg_key,'result',r.result,'source',r.source_url))into n,wins,losses,sources,facts
 from public.research_leg_results r where ticket.value->'leg_keys'?r.leg_key;
 if losses>0 then outcome:='LOSS';elsif wins=jsonb_array_length(ticket.value->'leg_keys')then outcome:='WIN';else continue;end if;
 insert into private.editorial_parlay_results(leg_key,leaf_results)values(ticket.leg_key,facts)on conflict do nothing;
 insert into public.research_leg_results(leg_key,result,source_url)values(ticket.leg_key,outcome,sources[1])on conflict do nothing;
 end loop;return new;end $function$
;

revoke all on function private.complete_editorial_parlay() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.create_member_parlay(p_title text, p_leg_keys text[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare keys text[]; key text; l record; g record; snapshot jsonb:='[]'; expires timestamptz; families text[]:='{}'; family text; player text; market text; result uuid;
begin
 if auth.uid() is null or not private.has_membership() then raise exception 'Sign in with an active account'; end if;
 if p_title is null or length(trim(p_title)) not between 1 and 80 then raise exception 'Use a name under 80 characters'; end if;
 if p_leg_keys is null or cardinality(p_leg_keys)<2 or array_position(p_leg_keys,null) is not null then raise exception 'Choose at least two published legs'; end if;
 select array_agg(k order by k) into keys from (select distinct unnest(p_leg_keys) k)x;
 if cardinality(keys)<>cardinality(p_leg_keys) then raise exception 'Duplicate legs are not allowed'; end if;
 foreach key in array keys loop
  select * into l from public.published_legs where leg_key=key;
  if not found or l.result is not null or l.expires_at<=now() then raise exception 'A selected leg is no longer available'; end if;
  select * into g from public.games where id=l.game_id;
  if not found or lower(g.sport)<>'nfl' or g.kickoff_tbd or g.kickoff<=now() then raise exception 'Choose upcoming NFL player legs'; end if;
  if l.market !~* '(receiving|rushing|passing).*(yards|yds)|receptions|catches' and not (l.market='Player Prop' and l.name ~* '(receiving|rushing|passing).*(yards|yds)|receptions|catches') then raise exception 'Only supported player-stat legs can be combined'; end if;
  if (l.market||' '||l.name) ~* '(quarter|half|live)' then raise exception 'Choose pregame full-game legs'; end if;
  market:=case when l.market='Player Prop' then l.name else l.market end;
  player:=case when l.market='Player Prop' then regexp_replace(l.name,'\s+(over\s+|under\s+)?[0-9]+(\.[0-9]+)?\+?\s+.*$','','i') else l.name end;
  family:=g.id::text||':'||lower(trim(player))||':'||case when market ~* 'receiving' then 'receiving' when market ~* 'rushing' then 'rushing' when market ~* 'passing' then 'passing' else 'receptions' end;
  if family=any(families) then raise exception 'Choose one target per player and statistic'; end if;
  families:=array_append(families,family);
  snapshot:=snapshot||jsonb_build_array(to_jsonb(l));
  expires:=least(expires,g.kickoff,l.expires_at);
 end loop;
 insert into public.member_parlays(user_id,title,leg_keys,legs,expires_at) values(auth.uid(),trim(p_title),keys,snapshot,expires)
 on conflict(user_id,leg_keys) do update set title=member_parlays.title returning id into result;
 return result;
end $function$
;

revoke all on function private.create_member_parlay(text,text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.edit_ruby_link(p_submission uuid, p_expected integer, p_title text, p_legs jsonb, p_note text, p_sport text, p_book text, p_odds integer, p_photo text, p_source_link text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original public.ruby_submissions; latest public.ruby_card_revisions; rid uuid:=gen_random_uuid(); n integer; leg jsonb;
begin
 if p_source_link is not null then
 p_source_link:=private.normalize_kalshi_source_link(p_source_link);
 if p_source_link is null then raise exception 'Invalid Kalshi source link';end if;end if;
 if private.is_admin() is distinct from true then raise exception 'Verified admin required';end if;
 select * into original from public.ruby_submissions where id=p_submission for update;
 if not found then raise exception 'Card not found';end if;
 select * into latest from public.ruby_card_revisions where submission_id=p_submission order by revision desc limit 1;
 n:=coalesce(latest.revision,0);
 if p_expected is distinct from n then raise exception 'Card changed. Reload before editing.';end if;
 if jsonb_typeof(p_legs) is distinct from 'array' then raise exception 'Invalid legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
 if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;end loop;
 if p_photo is not null and p_photo is distinct from coalesce(latest.photo_path,original.photo_path) and not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text) then raise exception 'Upload your own replacement screenshot';end if;
 insert into public.ruby_card_revisions(id,user_id,brand,theme,submission_day,sport,title,legs,note,photo_path,sportsbook,reported_odds,submission_id,revision,edited_by,source_link)
 values(rid,original.user_id,original.brand,original.theme,original.submission_day,p_sport,coalesce(nullif(btrim(p_title),''),original.brand||'’s daily lay'),p_legs,coalesce(btrim(p_note),''),p_photo,nullif(btrim(p_book),''),p_odds,p_submission,n+1,auth.uid(),p_source_link);
 return rid;
end $function$
;

revoke all on function private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_nfl_selection_gate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<gate>>
declare
 rules record; c jsonb; leaf jsonb; evidence jsonb; errors jsonb:='[]'; errs jsonb; all_candidates jsonb;
 game uuid; sport text; idx integer:=0; cnt integer:=0; halftime_cnt integer:=0; pod_cnt integer:=0; keys text[]:='{}'; identity text;
 bundle jsonb; bundle_count integer:=0; key text; chosen jsonb; selections jsonb:='[]';
begin
 select * into rules from private.nfl_selection_rule_versions where effective_at<=now() order by effective_at desc,version desc limit 1;
 if tg_table_name='official_picks' then
  select upper(g.sport) into sport from public.games g where g.id=new.game_id;
  if sport<>'NFL' then return new; end if;
  select a.sections->'selection_gate' into evidence from public.analysis_versions a where a.id=new.analysis_id;
  c:=jsonb_build_object('game_id',new.game_id,'name',evidence->>'player_name','market',evidence->>'market','copy_text',evidence->>'copy_text','odds',new.odds,'book',new.book,'quote_observed_at',evidence->>'quote_observed_at','quote_source_url',evidence->>'quote_source_url','selection_gate',evidence);
  if new.selection is distinct from evidence->>'copy_text' or new.market<>'Player Prop'
   or new.recommended_line is distinct from private.nfl_gate_number(evidence->'threshold')
   or new.direction is distinct from (case when evidence->>'direction'='under' then 'under' else 'over' end)
   or new.model_probability is distinct from private.nfl_gate_number(evidence->'model_probability')*100 then
   raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='Official selection, line, direction and probability must match reviewed analysis selection_gate';
  end if;
  all_candidates:=jsonb_build_array(c);
 else
  all_candidates:=new.candidates;
 end if;
 for c in select * from jsonb_array_elements(all_candidates) loop
  idx:=idx+1;
  if c->>'parlay'='true' then bundle:=c; bundle_count:=bundle_count+1; continue; end if;
  begin game:=(c->>'game_id')::uuid; exception when invalid_text_representation then game:=null; end;
  if game is null and tg_table_name='candidate_releases' then select s.game_id into game from public.challenge_stages s where s.id=new.stage_id; c:=c||jsonb_build_object('game_id',game); end if;
  select upper(g.sport) into sport from public.games g where g.id=game;
  if sport is null then errors:=errors||jsonb_build_array('R8: candidate '||idx||' has no resolvable game'); continue; end if;
  if sport<>'NFL' then continue; end if;
  cnt:=cnt+1;
  if c#>>'{selection_gate,phase}'='halftime' then halftime_cnt:=halftime_cnt+1; end if;
  if c->>'pick_of_day'='true' then pod_cnt:=pod_cnt+1; end if;
  errs:=private.nfl_selection_errors(c,rules.rules,now());
  if jsonb_array_length(errs)>0 then errors:=errors||jsonb_build_object('candidate',idx,'errors',errs); end if;
  identity:=private.nfl_gate_identity(game,c->>'name',c->>'market');
  if identity=any(keys) or exists(select 1 from private.nfl_selection_identities i where i.identity=gate.identity) then errors:=errors||jsonb_build_array('R8: duplicate selection at candidate '||idx); end if;
  keys:=array_append(keys,identity); selections:=selections||jsonb_build_array(c);
 end loop;
 if cnt=0 and bundle_count>0 then raise exception using message='NFL_SELECTION_GATE_BLOCKED',detail='Bundles require structured leaf selections; no bundle-only bypass'; end if;
 if halftime_cnt>(rules.rules->>'halftime_max')::integer or (halftime_cnt>0 and halftime_cnt<>cnt) then errors:=errors||'"R4: at most three halftime legs and no mixed pregame/halftime card"'::jsonb; end if;
 if pod_cnt>1 then errors:=errors||'"R3: only one Pick of the Day per release"'::jsonb; end if;
 if cnt>0 and bundle_count>0 then
  if bundle_count<>1 or cnt<>jsonb_array_length(all_candidates)-bundle_count or cnt not between (rules.rules->>'parlay_min')::integer and least((rules.rules->>'parlay_max')::integer,case when halftime_cnt>0 then (rules.rules->>'halftime_max')::integer else 4 end)
   or jsonb_typeof(bundle->'leg_keys') is distinct from 'array' or jsonb_typeof(bundle->'parlay_legs') is distinct from 'array' then errors:=errors||'"R6: one parlay with three to four qualifying leaves (halftime maximum three) required"'::jsonb;
  elsif jsonb_array_length(bundle->'leg_keys')<>cnt or jsonb_array_length(bundle->'parlay_legs')<>cnt then errors:=errors||'"R6: bundle and leaf counts differ"'::jsonb;
  else
   idx:=0;
   for leaf in select * from jsonb_array_elements(all_candidates) loop
    idx:=idx+1; if leaf->>'parlay'='true' then continue; end if;
    key:='candidate:'||new.id::text||':'||idx;
    if not (bundle->'leg_keys' ? key) or leaf->>'parlay_group' is distinct from new.id::text then errors:=errors||'"R6: bundle must reference exact leaves in this release"'::jsonb; end if;
    select x into chosen from jsonb_array_elements(bundle->'parlay_legs') x where x->>'name'=leaf->>'name' and x->>'market'=leaf->>'market' limit 1;
    if chosen is null then errors:=errors||'"R6: displayed parlay legs differ from validated leaves"'::jsonb; end if;
   end loop;
  end if;
  if coalesce(trim(bundle->>'correlation_review'),'')='' or coalesce(trim(bundle->>'failure_scenarios'),'')='' then errors:=errors||'"R6: correlation review and shared failure scenarios required"'::jsonb; end if;
  if bundle->>'pick_of_day'='true' then errors:=errors||'"R3: Pick of the Day must be a single selection"'::jsonb; end if;
 elsif cnt>0 and exists(select 1 from jsonb_array_elements(selections) x where coalesce(x->>'parlay_group','')<>'') then errors:=errors||'"R6: anchor/group requires a validated bundle in the same release"'::jsonb;
 end if;
 if jsonb_array_length(errors)>0 then raise exception using errcode='23514', message='NFL_SELECTION_GATE_BLOCKED',detail=jsonb_build_object('version',rules.version,'errors',errors)::text,hint='Read research/lessons/README.md and docs/product/nfl-selection-gate.md; withhold failed legs.'; end if;
 if cnt>0 then
  -- Unique identities close concurrent publication races, even for privileged direct inserts.
  foreach identity in array keys loop
   insert into private.nfl_selection_identities(identity,entity,entity_id) values(identity,tg_table_name,new.id);
  end loop;
  insert into private.nfl_selection_gate_decisions(version,entity,entity_id,accepted,errors,evidence) values(rules.version,tg_table_name,new.id,true,'[]',all_candidates);
 end if;
 return new;
end $function$
;

revoke all on function private.enforce_nfl_selection_gate() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_research_board()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 c jsonb; idx integer:=0; errors jsonb:='[]'; g public.games; odds numeric; threshold numeric; base text;
 quoted timestamptz; ev jsonb; cleared numeric; sample numeric; be numeric; sel text; keys text[]:='{}';
 m text[]; rule_version text;
begin
 for c in select * from jsonb_array_elements(new.candidates) loop
  idx:=idx+1;
  g:=null;
  if coalesce(c->>'game_id','') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
   select * into g from public.games where id=(c->>'game_id')::uuid;
  end if;
  if g.id is null or upper(g.sport)<>'NFL' or g.kickoff_tbd or g.kickoff<=now() then
   errors:=errors||jsonb_build_array(idx||': upcoming NFL game required'); continue;
  end if;
  if new.expires_at>g.kickoff then errors:=errors||jsonb_build_array(idx||': board must expire by kickoff'); end if;
  m:=regexp_match(coalesce(c->>'market',''),'^Full game · ([0-9]{1,3})\+ (rushing yards|receiving yards|passing yards|receptions)$');
  if m is null or coalesce(trim(c->>'name'),'')='' then errors:=errors||jsonb_build_array(idx||': full-game N+ player stat required'); continue; end if;
  threshold:=m[1]::numeric;
  base:=case m[2] when 'rushing yards' then 'player_rush_yds' when 'receiving yards' then 'player_reception_yds'
   when 'passing yards' then 'player_pass_yds' else 'player_receptions' end;
  odds:=private.nfl_gate_number(c->'odds');
  if c->>'book' is distinct from 'FanDuel' or odds is null or odds>-150 or odds<=-300 then
   errors:=errors||jsonb_build_array(idx||': FanDuel price from -150 to -299 required'); continue;
  end if;
  quoted:=private.nfl_gate_time(c->>'quote_observed_at');
  -- The exact price must come from a stored FanDuel observation of this line, at most eight hours old.
  if quoted is null or quoted<now()-interval '8 hours' or not exists(
   select 1 from public.source_observations o cross join lateral jsonb_array_elements(o.payload->'outcomes') x
   where o.game_id=g.id and o.kind='odds' and o.payload->>'book'='FanDuel'
    and o.payload->>'market' in (base, base||'_alternate') and o.observed_at=quoted
    and x->>'name'='Over' and x->>'description'=c->>'name'
    and private.nfl_gate_number(x->'point')=threshold-0.5 and private.nfl_gate_number(x->'price')=odds) then
   errors:=errors||jsonb_build_array(idx||': exact recent FanDuel observation required'); continue;
  end if;
  -- R1: five or more recent games, clear rate at least five points above the price's break-even.
  ev:=c->'research_evidence';
  cleared:=private.nfl_gate_number(ev->'cleared'); sample:=private.nfl_gate_number(ev->'sample');
  be:=-odds/(-odds+100)*100;
  if cleared is null or sample is null or sample<5 or cleared<0 or cleared>sample or cleared/sample*100<be+5 then
   errors:=errors||jsonb_build_array(idx||': recent form must beat break-even by five points'); continue;
  end if;
  if coalesce(trim(c->>'why'),'')='' or coalesce(trim(c->>'risk'),'')='' or jsonb_typeof(c->'sources') is distinct from 'array' then
   errors:=errors||jsonb_build_array(idx||': why, risk and sources required'); continue;
  end if;
  sel:=private.nfl_gate_identity(g.id,c->>'name',c->>'market');
  if sel=any(keys) or exists(select 1 from private.research_identities r where r.identity=sel)
   or exists(select 1 from private.nfl_selection_identities i where i.identity=sel) then
   errors:=errors||jsonb_build_array(idx||': selection already published');
  end if;
  keys:=array_append(keys,sel);
 end loop;
 if jsonb_array_length(errors)>0 then
  raise exception using errcode='23514', message='RESEARCH_BOARD_BLOCKED', detail=errors::text;
 end if;
 foreach sel in array keys loop
  insert into private.research_identities(identity,release_id) values(sel,new.id);
 end loop;
 select r.version into rule_version from private.nfl_selection_rule_versions r where r.effective_at<=now() order by r.effective_at desc, r.version desc limit 1;
 insert into private.nfl_selection_gate_decisions(version,entity,entity_id,accepted,errors,evidence)
  values(rule_version,'research_board',new.id,true,'[]',new.candidates);
 return new;
end $function$
;

revoke all on function private.enforce_research_board() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.enforce_weekly_sleeper()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 bundle jsonb:=new.candidates->0; c jsonb; ev jsonb; x jsonb; q public.source_observations;
 g public.games; earliest timestamptz; latest timestamptz; cutoff timestamptz; generated timestamptz;
 ids uuid[]:='{}'; history_ids text[]; keys jsonb:='[]'; shown jsonb:='[]'; copies text[]:='{}';
 i integer:=0; sample integer; m text[]; source_url text; source_id text; required text; season integer; week integer;
begin
 if jsonb_array_length(new.candidates) not between 3 and 13 then raise exception 'SLEEPER_BLOCKED: two to twelve distinct-game leaves required';end if;
 if new.publication_key !~ '^worth-a-dollar-[0-9]{4}-week[0-9]{1,2}-v[0-9]+$' then raise exception 'SLEEPER_BLOCKED: weekly publication key required';end if;
 foreach required in array array['why','risk','correlation_review','failure_scenarios'] loop
  if length(btrim(coalesce(bundle->>required,'')))=0 then raise exception 'SLEEPER_BLOCKED: missing bundle %',required;end if;
 end loop;
 for c in select value from jsonb_array_elements(new.candidates) loop
  i:=i+1;
  if jsonb_typeof(c) is distinct from 'object' or c->>'pick_of_day' is distinct from 'false' or c->>'fun_play' is distinct from 'false'
   or coalesce(c->>'research','false')<>'false' then raise exception 'SLEEPER_BLOCKED: no POD, Hail Mary or research-board mixing';end if;
  foreach required in array array['odds','price','payout','combined_odds','combined_price','edge','ev','confidence','model_probability','model_id','selection_gate','book'] loop
   if c ? required and c->required<>'null'::jsonb then raise exception 'SLEEPER_BLOCKED: unpriced entertainment cannot claim %',required;end if;
  end loop;
  if coalesce(c->>'gambly_url','') not in ('https://gambly.com','https://gambly.com/') then raise exception 'SLEEPER_BLOCKED: supported Gambly link required';end if;
  if i=1 then continue;end if;
  if c->>'analysis_kind' is distinct from 'ENTERTAINMENT_SLEEPER' or coalesce(c->>'parlay','false')<>'false'
   or coalesce(c->>'worth_a_dollar','false')<>'false' or c->>'parlay_group' is distinct from new.id::text then raise exception 'SLEEPER_BLOCKED: exact sleeper leaves required';end if;
  select * into g from public.games where id=(c->>'game_id')::uuid;
  if g.id is null or lower(g.sport)<>'nfl' or g.season is null or g.week is null or g.kickoff_tbd or g.kickoff<=now() or g.kickoff>now()+interval '7 days' then raise exception 'SLEEPER_BLOCKED: confirmed upcoming NFL game required';end if;
  if g.id=any(ids) then raise exception 'SLEEPER_BLOCKED: one sleeper per distinct game';end if;ids:=array_append(ids,g.id);
  if season is not null and (g.season<>season or g.week<>week) then raise exception 'SLEEPER_BLOCKED: one season/week only';end if;
  season:=g.season;week:=g.week;earliest:=least(earliest,g.kickoff);latest:=greatest(latest,g.kickoff);
  m:=regexp_match(coalesce(c->>'market',''),'^Full game · ([0-9]{1,3})\+ (rushing yards|receiving yards|passing yards|receptions)$');
  if m is null or m[1]::integer<1 or length(btrim(coalesce(c->>'name','')))=0
   or c->>'copy_text' is distinct from (c->>'name')||' '||m[1]||'+ '||m[2] then raise exception 'SLEEPER_BLOCKED: exact player/stat-only copy and target required';end if;
  ev:=c->'sleeper_evidence';cutoff:=private.nfl_gate_time(c->>'historical_cutoff');generated:=private.nfl_gate_time(c->>'generated_at');
  if ev ?| array['model_probability','model_id','edge','ev','confidence','validated'] then raise exception 'SLEEPER_BLOCKED: no model claims in evidence';end if;
  if jsonb_typeof(ev) is distinct from 'object' or cutoff is null or generated is null or cutoff>generated or generated>now() or generated<now()-interval '1 hour'
   or coalesce(ev->>'position','') not in ('QB','RB','WR','TE') or (ev->>'position'='TE' and m[2]<>'receptions') then raise exception 'SLEEPER_BLOCKED: fresh cutoff/role and TE receptions required';end if;
  foreach required in array array['opportunity_case','failure_path','matchup_case','availability_status','availability_note'] loop
   if length(btrim(coalesce(ev->>required,'')))=0 then raise exception 'SLEEPER_BLOCKED: missing %',required;end if;
  end loop;
  if ev->>'availability_status' not in ('confirmed_available','questionable','unconfirmed') then raise exception 'SLEEPER_BLOCKED: unavailable player excluded';end if;
  if length(btrim(coalesce(c->>'why','')))=0 or length(btrim(coalesce(c->>'risk','')))=0 or length(btrim(coalesce(c->>'quote_context','')))=0 then raise exception 'SLEEPER_BLOCKED: visible case/risk/unknown market required';end if;
  -- Historical facts remain facts; no priced clear-rate or probability is inferred.
  if jsonb_typeof(ev->'history') is distinct from 'array' or jsonb_array_length(ev->'history')<5 or ev->>'history_window' is distinct from 'latest_consecutive_games' then raise exception 'SLEEPER_BLOCKED: latest five sourced games required';end if;
  history_ids:='{}';sample:=0;
  for x in select value from jsonb_array_elements(ev->'history') loop
   if coalesce(x->>'game_id','')='' or x->>'game_id'=any(history_ids) or private.nfl_gate_number(x->'value') is null
    or private.nfl_gate_time(x->>'played_at') is null or private.nfl_gate_time(x->>'played_at')>=cutoff
    or coalesce(x->>'source_url','') !~ '^https://[^[:space:]]+$' then raise exception 'SLEEPER_BLOCKED: unique historical facts before cutoff required';end if;
   history_ids:=array_append(history_ids,x->>'game_id');sample:=sample+1;
  end loop;
  if jsonb_typeof(c->'source_observation_ids') is distinct from 'array' or jsonb_array_length(c->'source_observation_ids')=0 then raise exception 'SLEEPER_BLOCKED: immutable source observations required';end if;
  foreach required in array array['history_source_url','role_source_url','availability_source_url','weather_source_url'] loop
   source_url:=ev->>required;
   if source_url is null and required='weather_source_url' and length(btrim(coalesce(ev->>'weather_unknown','')))>0 then continue;end if;
   if coalesce(source_url,'') !~ '^https://[^[:space:]]+$' then raise exception 'SLEEPER_BLOCKED: source or explicit weather unknown required';end if;
   if not exists(select 1 from jsonb_array_elements(c->'sources') s where s->>'url'=source_url) then raise exception 'SLEEPER_BLOCKED: displayed sources must match evidence';end if;
   if not exists(select 1 from public.source_observations o cross join lateral jsonb_array_elements(o.payload->'source_files') f
    where o.id::text in(select jsonb_array_elements_text(c->'source_observation_ids')) and o.game_id=g.id and o.recorded_at<=cutoff
    and f->>'url'=source_url and f->>'sha256' ~ '^[a-f0-9]{64}$' and private.nfl_gate_time(f->>'retrieved_at')<=cutoff
    and private.nfl_gate_time(f->>'retrieved_at')>=now()-interval '7 days') then raise exception 'SLEEPER_BLOCKED: hashed source provenance missing';end if;
  end loop;
  keys:=keys||jsonb_build_array('candidate:'||new.id::text||':'||i);
  shown:=shown||jsonb_build_array(jsonb_build_object('name',c->>'name','market',c->>'market'));
  copies:=array_append(copies,c->>'copy_text');
 end loop;
 if new.publication_key !~ ('^worth-a-dollar-'||season||'-week'||week||'-v[0-9]+$') then raise exception 'SLEEPER_BLOCKED: key must match slate';end if;
 if split_part(new.publication_key,'-v',2)::integer<1 or (split_part(new.publication_key,'-v',2)='1' and bundle->>'supersedes_release_id' is not null) then raise exception 'SLEEPER_BLOCKED: original and revision identity invalid';end if;
 if split_part(new.publication_key,'-v',2)<>'1' and coalesce(bundle->>'supersedes_release_id','')='' then raise exception 'SLEEPER_BLOCKED: updates must link original';end if;
 if bundle->>'supersedes_release_id' is not null and not exists(select 1 from public.candidate_releases r where r.id=(bundle->>'supersedes_release_id')::uuid and r.publication_key='worth-a-dollar-'||season||'-week'||week||'-v1') then raise exception 'SLEEPER_BLOCKED: original update link invalid';end if;
 if new.expires_at is distinct from earliest or private.nfl_gate_time(bundle->>'sweat_until')<latest
  or private.nfl_gate_time(bundle->>'sweat_until')>latest+interval '12 hours' or private.nfl_gate_time(bundle->>'sweat_until') is null then raise exception 'SLEEPER_BLOCKED: exact earliest expiry and bounded sweat window required';end if;
 if bundle->'leg_keys' is distinct from keys or bundle->>'copy_text' is distinct from array_to_string(copies,E'\n')
  or jsonb_typeof(bundle->'parlay_legs') is distinct from 'array' or jsonb_array_length(bundle->'parlay_legs')<>array_length(ids,1)
  or exists(select 1 from jsonb_array_elements(shown) expected where not exists(select 1 from jsonb_array_elements(bundle->'parlay_legs') actual where actual->>'name'=expected->>'name' and actual->>'market'=expected->>'market')) then raise exception 'SLEEPER_BLOCKED: displayed ticket and exact leaf references must match';end if;
 insert into private.weekly_sleeper_reviews(release_id,evidence) values(new.id,new.candidates);
 return new;
end $function$
;

revoke all on function private.enforce_weekly_sleeper() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.feature_ruby(p_submission uuid, p_odds integer, p_book text, p_source text, p_observed timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not private.age_member_allowed() or not coalesce(public.is_admin(),false) then raise exception 'Admin verification required';end if;
 if p_observed>now() or p_observed<now()-interval '30 minutes' then raise exception 'Verify a quote from the last 30 minutes';end if;
 if not exists(select 1 from public.ruby_submissions where id=p_submission and submission_day=(now() at time zone 'America/New_York')::date) then raise exception 'Choose a contributor lay published today';end if;
 insert into public.ruby_daily_features(submission_id,verified_odds,sportsbook,source_url,observed_at,verified_by) values(p_submission,p_odds,btrim(p_book),p_source,p_observed,auth.uid());
 -- One immutable feature per Eastern date; never overwrite an original ticket.
end$function$
;

revoke all on function private.feature_ruby(uuid,integer,text,text,timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.free_challenge_desk()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 raise exception 'Anonymous/free consumer contracts are unavailable on isolated staging' using errcode='42501';
end
$function$
;

revoke all on function private.free_challenge_desk() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_community_poll()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o jsonb; seen text[] := '{}'; t text;
begin
 new.question := btrim(new.question);
 for o in select value from jsonb_array_elements(new.options) loop
  if jsonb_typeof(o) <> 'string' then raise exception 'Poll options must be text'; end if;
  t := btrim(o #>> '{}');
  if length(t) not between 1 and 60 then raise exception 'Poll options must be 1-60 characters'; end if;
  if lower(t) = any(seen) then raise exception 'Poll options must be different'; end if;
  seen := seen || lower(t);
 end loop;
 if (new.question || ' ' || array_to_string(seen, ' ')) ~*
  '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims';
 end if;
 new.options := (select jsonb_agg(btrim(value #>> '{}')) from jsonb_array_elements(new.options));
 return new;
end $function$
;

revoke all on function private.guard_community_poll() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_community_profile_text()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 new.tagline := btrim(coalesce(new.tagline, ''));
 new.bio := btrim(coalesce(new.bio, ''));
 if (new.tagline || ' ' || new.bio) ~*
  '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims';
 end if;
 return new;
end $function$
;

revoke all on function private.guard_community_profile_text() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_community_typed_reaction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.user_id is distinct from auth.uid() or not private.community_reaction_actor_allowed() then
  raise exception 'Community reaction unavailable';
 end if;
 return new;
end $function$
;

revoke all on function private.guard_community_typed_reaction() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_kalshi_revision_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_source text; latest_source text;
begin
 -- Removing a link remains possible if the existing minimum-content check passes.
 if new.source_link is null then return new;end if;
 -- Use the same per-card lock as edit_ruby: compare with the CURRENT revision,
 -- not an old original link, and serialize competing edit operations.
 select source_link into current_source from public.ruby_submissions
  where id=new.submission_id for update;
 if not found then raise exception 'Card not found';end if;
 select source_link into latest_source from public.ruby_card_revisions
  where submission_id=new.submission_id order by revision desc limit 1;
 if found then current_source:=latest_source;end if;
 if new.source_link is distinct from current_source then
  raise exception 'Kalshi source changes are temporarily unavailable.';
 end if;
 return new;
end $function$
;

revoke all on function private.guard_kalshi_revision_pause() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_kalshi_submission_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if new.source_link is not null then
  if tg_op='INSERT' then
   raise exception 'Kalshi is temporarily unavailable. Use typed legs or a screenshot instead.';
  elsif new.source_link is distinct from old.source_link then
   raise exception 'Kalshi source changes are temporarily unavailable.';
  end if;
 end if;
 return new;
end $function$
;

revoke all on function private.guard_kalshi_submission_pause() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_nfl_edge_release()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.official_picks; item jsonb;
begin
 select * into p from public.official_picks where id=new.official_pick_id;
 if not exists(select 1 from public.games g where g.id=p.game_id and upper(g.sport)='NFL') then return new; end if;
 item:=new.items->0;
 if jsonb_array_length(new.items)<>1 or item->>'selection' is distinct from p.selection
  or private.nfl_gate_number(item->'odds') is distinct from p.odds
  or not exists(select 1 from private.nfl_selection_gate_decisions d where d.entity='official_picks' and d.entity_id=p.id and d.accepted) then
  raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='Edge releases require the gated official selection only; unreviewed target-leg extras are prohibited';
 end if;
 return new;
end $function$
;

revoke all on function private.guard_nfl_edge_release() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_nfl_feed_decision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.category='Decision' and (new.game_id is null or exists(select 1 from public.games g where g.id=new.game_id and upper(g.sport)='NFL')) and not exists(select 1 from public.research_leg_results r where r.leg_key=new.result_leg_key) then
  raise exception using errcode='23514',message='NFL_SELECTION_GATE_BLOCKED',detail='New NFL Decision cards must use gated candidate_releases. Use Watchlist/Injury watch/Market update for research; result-linked updates remain allowed.';
 end if;
 return new;
end $function$
;

revoke all on function private.guard_nfl_feed_decision() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_numeric_sack_contract()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c jsonb; published timestamptz; bits text[]; amount numeric; op text; reviewed timestamptz;
begin
 if new.metric<>'def_sacks' then return new; end if;
 select x.value,r.created_at into c,published from public.candidate_releases r cross join lateral jsonb_array_elements(r.candidates) with ordinality x(value,n)
 where 'candidate:'||r.id::text||':'||x.n::text=new.leg_key;
 begin reviewed:=(c#>>'{sack_settlement_review,observed_at}')::timestamptz; exception when others then reviewed:=null; end;
 if c is null or c->>'sack_market_type' is distinct from 'numeric_total' or c->>'book' is distinct from 'FanDuel'
 or coalesce(c#>>'{sack_settlement_review,source_url}','')!~'^https://' or reviewed is null or reviewed>published
 or c->>'market' is distinct from new.market or c->>'name' is distinct from new.player or c->>'game_id' is distinct from new.game_id::text then
  raise exception 'Numeric sack contract needs exact immutable publication and pre-publication settlement review'; end if;
 bits:=regexp_match(new.market,'^Full game · (?:([0-9]+(?:[.][0-9]+)?)\+|(Over|Under) ([0-9]+(?:[.][0-9]+)?)) sacks$');
 if bits is null then raise exception 'Unsupported sack market; Yes/No is not a numeric total'; end if;
 amount:=coalesce(bits[1],bits[3])::numeric; op:=case when bits[1] is not null then 'gte' when bits[2]='Over' then 'over' else 'under' end;
 if amount<>new.threshold or op<>new.operator then raise exception 'Sack target differs from published contract'; end if;
 return new;
end $function$
;

revoke all on function private.guard_numeric_sack_contract() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_ruby_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE' and not exists(select 1 from public.ruby_submissions s where s.id=old.submission_id) then
  return old;
 end if;
 if tg_op='UPDATE' and old.edited_by is not null and new.edited_by is null
    and (to_jsonb(new)-'edited_by')=(to_jsonb(old)-'edited_by')
    and not exists(select 1 from auth.users u where u.id=old.edited_by) then
  return new;
 end if;
 raise exception 'Card revisions are immutable. Add a new revision instead.';
end $function$
;

revoke all on function private.guard_ruby_revision() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.guard_sack_result_credit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if exists(select 1 from private.leg_result_contracts c where c.leg_key=new.leg_key and c.metric='def_sacks')
 and (new.value<0 or new.value*2<>trunc(new.value*2)) then raise exception 'Invalid defensive sack credit'; end if;
 return new;
end $function$
;

revoke all on function private.guard_sack_result_credit() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ begin raise exception 'Published records are immutable. Add a new version or an explicit correction event.'; end $function$
;

revoke all on function private.immutable() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.index_source_observation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o jsonb; opposite jsonb; mid uuid; m text; sel text; label text; begin
 if new.kind='odds' and new.observed_at is not null and new.observed_at<=now()+interval '5 minutes' then
  m=new.payload->>'market';
  if m not in ('h2h','spreads','totals','player_reception_yds','player_rush_yds') then return new; end if;
  for o in select value from jsonb_array_elements(new.payload->'outcomes') loop
   select value into opposite from jsonb_array_elements(new.payload->'outcomes') where value->>'name'<>o->>'name' and coalesce(value->>'description','')=coalesce(o->>'description','') and (m='h2h' or (m='spreads' and (value->>'point')::numeric=-(o->>'point')::numeric) or (m in ('totals','player_reception_yds','player_rush_yds') and value->>'point'=o->>'point')) limit 1;
   if opposite is null then continue; end if;
   sel=concat_ws(' ',nullif(o->>'description',''),o->>'name');
   label=sel||' · '||m;
   insert into public.intelligence_markets(game_id,market_key,label,market_type,selection,opposite,period,rules)
   values(new.game_id,'feed:'||m||':'||sel,label,case when m='h2h' then 'Moneyline' when m='spreads' then 'Side' when m='totals' then 'Total' else 'Player Prop' end,sel,concat_ws(' ',nullif(opposite->>'description',''),opposite->>'name'),'Full game','Provider quote; verify sportsbook settlement rules before comparison') on conflict(game_id,market_key) do nothing;
   select id into mid from public.intelligence_markets where game_id=new.game_id and market_key='feed:'||m||':'||sel;
   insert into public.intelligence_quotes(market_id,book,line,odds,opposite_odds,observed_at,time_basis,source,notes)
   values(mid,new.payload->>'book',(o->>'point')::numeric,(o->>'price')::numeric,(opposite->>'price')::numeric,new.observed_at,'observed',new.source,'Automated provider snapshot. Not an executable quote.');
  end loop;
 elsif new.kind in ('news','injury','weather') then
  insert into public.intelligence_news(game_id,category,headline,body,observed_at,time_basis,source)
  values(new.game_id,case new.kind when 'news' then 'Team' when 'injury' then 'Injury' else 'Weather' end,
  left(coalesce(new.payload->>'headline',nullif(concat_ws(' · ',new.payload->>'player',new.payload->>'status'),''),new.kind),300),
  new.payload::text,coalesce(new.observed_at,new.recorded_at),case when new.observed_at is null then 'received' else 'published' end,new.source);
 end if;
 return new;
end $function$
;

revoke all on function private.index_source_observation() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin return private.age_member_allowed() and private.before_age_is_admin();end$function$
;

revoke all on function private.is_admin() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.is_research_release(c jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_typeof(c)='array' and jsonb_array_length(c)>0 and not exists(
  select 1 from jsonb_array_elements(c) x
  where jsonb_typeof(x)<>'object' or x->>'research' is distinct from 'true'
   or x->>'analysis_kind' is distinct from 'RESEARCH_BOARD'
   or coalesce(x->>'parlay','false')<>'false' or coalesce(x->>'pick_of_day','false')<>'false'
   or coalesce(x->>'fun_play','false')<>'false' or x ? 'legs' or x ? 'parlay_group'
   or x ? 'supersedes_release_id' or x ? 'selection_gate');
$function$
;

revoke all on function private.is_research_release(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.is_weekly_sleeper(c jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_typeof(c)='array' and c#>>'{0,analysis_kind}'='ENTERTAINMENT_SLEEPER_PARLAY'
 and c#>>'{0,worth_a_dollar}'='true' and c#>>'{0,parlay}'='true'
$function$
;

revoke all on function private.is_weekly_sleeper(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.keep_first_market_price()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (new.leg_key, new.book, new.first_price, new.first_point, new.first_observed_at)
  is distinct from (old.leg_key, old.book, old.first_price, old.first_point, old.first_observed_at) then
  raise exception 'First market price is immutable';
 end if;
 return new;
end $function$
;

revoke all on function private.keep_first_market_price() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.leg_tail_counts(p_legs text[])
 RETURNS TABLE(leg_key text, tail_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if not private.age_member_allowed() then raise exception 'Age verification required'; end if;
 if cardinality(p_legs)>150 then raise exception 'At most 150 legs per batch'; end if;
 return query
 with requested as (select distinct unnest(p_legs) as key)
 select r.key,count(t.user_id) from requested r
 left join public.leg_tails t on t.leg_key=r.key
 where r.key is not null group by r.key;
end $function$
;

revoke all on function private.leg_tail_counts(text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.lock_personal_run_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a public.personal_challenges;
begin
 select * into a from public.personal_challenges where id=new.personal_challenge_id;
 if a.id is null or a.user_id is distinct from auth.uid() then raise exception 'Personal account not found'; end if;
 perform pg_advisory_xact_lock(hashtextextended(a.user_id::text||a.challenge_id::text,0));
 return new;
end $function$
;

revoke all on function private.lock_personal_run_event() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nba_minor_correction(p_game uuid, p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.nba_game_results; s text; bad boolean;
begin
 select * into r from public.nba_game_results where game_id = p_game;
 if not found or jsonb_typeof(p->'players') <> 'array' then return false; end if;
 -- Same final score and overtime.
 if coalesce(p->'away'->>'score','') !~ '^\d+$' or coalesce(p->'home'->>'score','') !~ '^\d+$'
    or (p->'away'->>'score')::int <> r.away_score or (p->'home'->>'score')::int <> r.home_score
    or coalesce((p->>'overtime')::boolean, false) <> r.overtime then return false; end if;
 -- Every stat present and numeric.
 if exists (select 1 from jsonb_array_elements(p->'players') x
   where coalesce(x->>'athlete_id','') !~ '^\d+$' or x->>'side' not in ('away','home') or jsonb_typeof(x->'played') <> 'boolean'
    or exists (select 1 from unnest(array['points','rebounds','assists','threes','steals','blocks','turnovers']) k where coalesce(x->>k,'') !~ '^\d+$')
    or (x ? 'minutes' and jsonb_typeof(x->'minutes') <> 'null' and coalesce(x->>'minutes','') !~ '^\d+$')) then return false; end if;
 -- The revised read adds up on its own.
 for s in select unnest(array['away','home']) loop
  select count(*) filter (where (x->>'played')::boolean) < 5
      or coalesce(sum((x->>'points')::int), 0) is distinct from (p->s->>'score')::int
      or coalesce(sum((x->>'rebounds')::int), 0) is distinct from (p->s->>'rebounds')::int
      or coalesce(sum((x->>'assists')::int), 0) is distinct from (p->s->>'assists')::int
      or coalesce(sum((x->>'threes')::int), 0) is distinct from (p->s->>'threes')::int
   into bad from jsonb_array_elements(p->'players') x where x->>'side' = s;
  if bad then return false; end if;
 end loop;
 -- Recorded players: present with the same played flag and every stat within 2, or absent and inactive.
 if exists (select 1 from public.nba_player_results o
   left join lateral (select x from jsonb_array_elements(p->'players') x where x->>'athlete_id' = o.athlete_id limit 1) j on true
   where o.game_id = p_game and case
    when j.x is null then o.played or o.points + o.rebounds + o.assists + o.threes + o.steals + o.blocks + o.turnovers > 0
    else (j.x->>'played')::boolean <> o.played
     or abs((j.x->>'points')::int - o.points) > 2 or abs((j.x->>'rebounds')::int - o.rebounds) > 2
     or abs((j.x->>'assists')::int - o.assists) > 2 or abs((j.x->>'threes')::int - o.threes) > 2
     or abs((j.x->>'steals')::int - o.steals) > 2 or abs((j.x->>'blocks')::int - o.blocks) > 2
     or abs((j.x->>'turnovers')::int - o.turnovers) > 2
     or abs(coalesce((j.x->>'minutes')::int, 0) - coalesce(o.minutes, 0)) > 2
    end) then return false; end if;
 -- Players new to the revision: did not play, no stats.
 if exists (select 1 from jsonb_array_elements(p->'players') x
   where not exists (select 1 from public.nba_player_results o where o.game_id = p_game and o.athlete_id = x->>'athlete_id')
    and ((x->>'played')::boolean or (x->>'points')::int + (x->>'rebounds')::int + (x->>'assists')::int + (x->>'threes')::int
      + (x->>'steals')::int + (x->>'blocks')::int + (x->>'turnovers')::int > 0)) then return false; end if;
 return true;
end $function$
;

revoke all on function private.nba_minor_correction(uuid,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfl_gate_identity(game uuid, player text, market text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare stat text; dir text; amount numeric; cleaned text:=lower(coalesce(market,'')); name text:=lower(coalesce(player,''));
begin
 -- Legacy official names may contain the whole target instead of a separate player field.
 if cleaned in ('player prop','') then cleaned:=name; name:=regexp_replace(name,'[[:space:]]+(over[[:space:]]+|under[[:space:]]+)?[0-9].*$',''); end if;
 stat:=case when cleaned like '%rushing%' then 'rushing_yards' when cleaned like '%receiving%' then 'receiving_yards' when cleaned like '%passing%' then 'passing_yards' when cleaned like '%reception%' or cleaned like '%catch%' then 'receptions' end;
 amount:=substring(cleaned from '([0-9]+(?:\.[0-9]+)?)')::numeric;
 dir:=case when cleaned like '%under%' then 'under' else 'over' end;
 if stat is not null and amount is not null then
  if dir='under' then amount:=ceil(amount)-1;
  elsif cleaned like '%+%' then amount:=ceil(amount);
  else amount:=floor(amount)+1; end if;
  return game::text||':'||regexp_replace(name,'[^a-z0-9]','','g')||':'||stat||':'||dir||':'||trim_scale(amount)::text;
 end if;
 return game::text||':'||regexp_replace(name||' '||cleaned,'[^a-z0-9]','','g');
end $function$
;

revoke all on function private.nfl_gate_identity(uuid,text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfl_gate_number(v jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
begin
 if jsonb_typeof(v) <> 'number' or v is null or v::text !~ '^-?[0-9]+(\.[0-9]+)?$' then return null; end if;
 return v::text::numeric;
end $function$
;

revoke all on function private.nfl_gate_number(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfl_gate_time(v text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
 if v is null or v !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' then return null; end if;
 return v::timestamptz;
exception when others then return null;
end $function$
;

revoke all on function private.nfl_gate_time(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nfl_selection_errors(c jsonb, rules jsonb, as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 e jsonb:='[]'; s jsonb:=c->'selection_gate'; g public.games; q public.source_observations; initial_q public.source_observations;
 odds numeric:=private.nfl_gate_number(c->'odds'); threshold numeric; be numeric; clear_rate numeric;
 sample jsonb; x jsonb; total integer:=0; hits integer:=0; ids text[]:='{}'; vals numeric[]:='{}'; median_value numeric;
 value numeric; t timestamptz; qt timestamptz; observed timestamptz; cutoff timestamptz;
 phase text; stat text; dir text; position text; point numeric; provider_market text; provider_direction text;
 first_odds numeric; p numeric; baseline jsonb; matching jsonb; m text; required text;
begin
 if jsonb_typeof(s) is distinct from 'object' then return jsonb_build_array('R1-R8: selection_gate evidence object required'); end if;
 if coalesce(s->>'version','') <> '2026-10-16.r1' then e:=e||'"R1-R8: unsupported evidence version"'::jsonb; end if;
 begin select * into g from public.games where id=(c->>'game_id')::uuid;
 exception when invalid_text_representation then null; end;
 if g.id is null or upper(g.sport)<>'NFL' or g.kickoff_tbd then return e||'"R8: exact NFL game and confirmed kickoff required"'::jsonb; end if;
 phase:=s->>'phase'; stat:=s->>'stat'; dir:=s->>'direction'; position:=s->>'position';
 threshold:=trim_scale(private.nfl_gate_number(s->'threshold'));
 if phase is null or phase not in ('pregame','halftime') then e:=e||'"R4: phase must be pregame or halftime"'::jsonb; end if;
 if stat is null or stat not in ('rushing_yards','receiving_yards','receptions','passing_yards') or dir is null or dir not in ('at_least','over','under') or threshold is null or threshold<0 then
  return e||'"R8: supported structured player stat, direction and threshold required"'::jsonb;
 end if;
 if dir='at_least' and trunc(threshold)<>threshold then e:=e||'"R8: at-least stat targets require whole numbers"'::jsonb; end if;
 if coalesce(trim(c->>'name'),'')='' or position is null or position not in ('QB','RB','WR','TE') or coalesce(s->>'team','') not in (g.home_abbreviation,g.away_abbreviation) then
  e:=e||'"R8: named player, position and team required"'::jsonb;
 end if;
 -- Require an exact rendering of the structured selection so evidence cannot describe another line.
 m:=case stat when 'rushing_yards' then 'rushing yards' when 'receiving_yards' then 'receiving yards' when 'passing_yards' then 'passing yards' else 'receptions' end;
 required:=case dir when 'at_least' then threshold::text||'+ '||m when 'over' then 'Over '||threshold::text||' '||m else 'Under '||threshold::text||' '||m end;
 if coalesce(c->>'market','') <> 'Full game · '||required or coalesce(c->>'copy_text','') <> (c->>'name')||' '||required then
  e:=e||'"R8: display market and Gambly copy must exactly match structured target"'::jsonb;
 end if;
 if odds is null or abs(odds)<100 or abs(odds)>100000 or trunc(odds)<>odds or coalesce(c->>'book','')<>all(array['FanDuel','DraftKings','BetMGM','Caesars','BetRivers','Fanatics']) then
  e:=e||'"R8: exact numeric American price at a collected sportsbook required"'::jsonb;
 else be:=case when odds<0 then abs(odds)/(abs(odds)+100) else 100/(odds+100) end; end if;
 -- Historical screening is never substituted for model probability.
 sample:=s->'history';
 if jsonb_typeof(sample) is distinct from 'array' then e:=e||'"R1: sourced last-5+ game history required"'::jsonb;
 else
  for x in select * from jsonb_array_elements(sample) loop
   value:=private.nfl_gate_number(x->'value'); t:=private.nfl_gate_time(x->>'played_at');
   if value is null or t is null or t>=g.kickoff or t>=as_of or coalesce(x->>'source_url','') !~ '^https://' or coalesce(x->>'game_id','')='' or (x->>'game_id')=any(ids) then
    e:=e||'"R1: historical games must be unique, sourced and before publication/kickoff"'::jsonb;
   else
    ids:=array_append(ids,x->>'game_id'); vals:=array_append(vals,value); total:=total+1;
    if (dir='at_least' and value>=threshold) or (dir='over' and value>threshold) or (dir='under' and value<threshold) then hits:=hits+1; end if;
   end if;
  end loop;
  if total<(rules->>'history_min')::integer or s->>'history_window' is distinct from 'latest_consecutive_games' or coalesce(s->>'history_source_url','') !~ '^https://' then e:=e||'"R1: at least five latest consecutive games and history provenance required"'::jsonb; end if;
  if total>0 then
   clear_rate:=hits::numeric/total;
   select percentile_cont(0.5) within group(order by z) into median_value from unnest(vals) z;
   if be is null or clear_rate < be+(rules->>'history_margin')::numeric then e:=e||'"R1: last-5+ clear rate below break-even plus five points"'::jsonb; end if;
  end if;
 end if;
 -- Model registry must contain independently approved validation, not SHADOW_ONLY.
 p:=private.nfl_gate_number(s->'model_probability'); cutoff:=private.nfl_gate_time(s->>'historical_cutoff');
 if not exists(select 1 from private.nfl_selection_model_approvals a where a.model_id=s->>'model_id' and stat=any(a.markets) and phase=any(a.phases) and position=any(a.positions) and threshold between a.line_min and a.line_max and odds between a.odds_min and a.odds_max and a.approved_at<=as_of)
  or p is null or p<0 or p>1 or cutoff is null or cutoff>=g.kickoff or cutoff>as_of
  or coalesce(s->>'forecast_source_url','') !~ '^https://' or jsonb_typeof(s->'input_hashes') is distinct from 'object' or s->'input_hashes'='{}'::jsonb
  or private.nfl_gate_time(s->>'generated_at') is null or private.nfl_gate_time(s->>'generated_at')>as_of
  or private.nfl_gate_time(s->>'generated_at')<as_of-interval '15 minutes'
 then e:=e||'"BIBLE/R2: approved priced model evidence required; SHADOW_ONLY and historical clear rates cannot establish edge"'::jsonb;
 elsif be is null or p-be<(rules->>'edge_min')::numeric then e:=e||'"BIBLE/R2: model edge below three percentage points"'::jsonb; end if;
 if (dir='under' or median_value is null or threshold>=median_value) and odds between (rules->>'preferred_min')::numeric and (rules->>'preferred_max')::numeric then
  e:=e||'"R2: preferred alternate over target must be below historical median"'::jsonb;
 end if;
 if c->>'pick_of_day'='true' and (odds is null or odds not between (rules->>'pod_min')::numeric and (rules->>'pod_max')::numeric) then e:=e||'"R3: Pick of the Day must be -150 through -300"'::jsonb; end if;
 if odds<=-500 and coalesce(c->>'parlay_group','')='' then e:=e||'"R3: -500 or shorter is an anchor only, never a standalone selection"'::jsonb; end if;
 if position='TE' and stat<>'receptions' then e:=e||'"R5: tight ends require receptions or skip"'::jsonb; end if;
 if phase='pregame' and (as_of>=g.kickoff or as_of<g.kickoff-make_interval(hours=>(rules->>'lock_hours')::integer)) then e:=e||'"R7: publish only after a fresh lock review within two hours before kickoff; earlier cards remain drafts"'::jsonb; end if;
 if phase='halftime' then
  if as_of<g.kickoff or odds is null or odds not between (rules->>'preferred_min')::numeric and (rules->>'preferred_max')::numeric or dir='under' then e:=e||'"R4: halftime requires overs at -150 through -249 after kickoff"'::jsonb; end if;
  if coalesce(s->>'live_status','')<>'STATUS_HALFTIME' or private.nfl_gate_time(s->>'live_observed_at') is null or private.nfl_gate_time(s->>'live_observed_at')<as_of-make_interval(secs=>(rules->>'live_seconds')::integer) or private.nfl_gate_time(s->>'live_observed_at')>as_of or coalesce(s->>'live_source_url','') !~ '^https://' then e:=e||'"R4: fresh sourced halftime status required"'::jsonb; end if;
  value:=private.nfl_gate_number(s->'team_lead');
  if value is null or (stat in ('receiving_yards','receptions') and value >= (rules->>'lead_limit')::numeric) then e:=e||'"R4: no receiving overs for teams leading by ten or more; score evidence required"'::jsonb; end if;
  value:=private.nfl_gate_number(s->'first_half_yards');
  if stat='rushing_yards' and (value is null or value<=0 or greatest(threshold-value,0)>value*(rules->>'rush_remaining_fraction')::numeric) then e:=e||'"R4: rushing target needs over thirty percent of first-half yards, or first-half evidence is missing"'::jsonb; end if;
 end if;
 foreach required in array array['opportunity_case','failure_path','role_source_url','availability_source_url','game_script_review'] loop
  if coalesce(trim(s->>required),'')='' then e:=e||jsonb_build_array('REVIEW: missing '||required); end if;
 end loop;
 if s->>'availability_verified' is distinct from 'true' then e:=e||'"REVIEW: explicit availability verification required"'::jsonb; end if;
 -- Link to immutable collector observation and match exact player/line/direction/price.
 begin select * into q from public.source_observations where id=(s->>'quote_observation_id')::uuid; exception when invalid_text_representation then null; end;
 provider_market:=case stat when 'rushing_yards' then 'player_rush_yds' when 'receiving_yards' then 'player_reception_yds' when 'passing_yards' then 'player_pass_yds' else 'player_receptions' end;
 provider_direction:=case dir when 'under' then 'Under' else 'Over' end;
 point:=case dir when 'at_least' then threshold-0.5 else threshold end;
 qt:=private.nfl_gate_time(q.payload->>'provider_updated_at'); observed:=private.nfl_gate_time(c->>'quote_observed_at');
 if q.id is null or q.game_id is distinct from g.id or q.kind<>'odds' or q.payload->>'book' is distinct from c->>'book'
  or q.payload->>'market' not in (provider_market,provider_market||'_alternate') or qt is null or qt>as_of or qt<as_of-make_interval(secs=>case when phase='halftime' then (rules->>'live_seconds')::integer else (rules->>'quote_seconds')::integer end)
  or observed is distinct from qt or q.recorded_at>as_of or coalesce(c->>'quote_source_url','')!~'^https://' or c->>'quote_source_url' is distinct from q.source then
  e:=e||'"R8: fresh immutable exact-market observation from the published sportsbook and quote provenance required"'::jsonb;
 else
  select o into matching from jsonb_array_elements(q.payload->'outcomes') o where o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point and private.nfl_gate_number(o->'price')=odds limit 1;
  if matching is null then e:=e||'"R8: quote does not match exact player, market, direction, line and price"'::jsonb; end if;
  if exists(select 1 from public.source_observations newer where newer.game_id=g.id and newer.kind='odds' and newer.payload->>'book'=q.payload->>'book' and newer.payload->>'market'=q.payload->>'market' and newer.observed_at>q.observed_at and newer.recorded_at<=as_of) then e:=e||'"R7: a newer market snapshot exists; refresh the selection"'::jsonb; end if;
 end if;
 begin select * into initial_q from public.source_observations where id=(s->>'initial_quote_observation_id')::uuid; exception when invalid_text_representation then null; end;
 if initial_q.id is null or initial_q.game_id is distinct from g.id or initial_q.payload->>'book' is distinct from q.payload->>'book' or initial_q.payload->>'market' is distinct from q.payload->>'market' or initial_q.observed_at>q.observed_at then e:=e||'"R7: matching initial price observation required"'::jsonb;
 else
  select o into baseline from jsonb_array_elements(initial_q.payload->'outcomes') o where o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point limit 1;
  if exists(select 1 from public.source_observations earlier cross join lateral jsonb_array_elements(earlier.payload->'outcomes') o
   where earlier.game_id=g.id and earlier.kind='odds' and earlier.payload->>'book'=q.payload->>'book' and earlier.payload->>'market'=q.payload->>'market'
   and earlier.observed_at<initial_q.observed_at and o->>'description'=c->>'name' and o->>'name'=provider_direction and private.nfl_gate_number(o->'point')=point) then
   e:=e||'"R7: initial observation must be earliest stored exact selection price"'::jsonb;
  end if;
  first_odds:=private.nfl_gate_number(baseline->'price');
  if first_odds is null or (odds-first_odds >= (rules->>'adverse_cents')::numeric) then e:=e||'"R7: initial price missing or market moved fifteen cents or more against selection"'::jsonb; end if;
 end if;
 return e;
end $function$
;

revoke all on function private.nfl_selection_errors(jsonb,jsonb,timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.nhl_chart_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if tg_op='DELETE' then raise exception 'NHL chart snapshots are immutable';end if;
 if (new.id,new.game_id,new.day,new.payload,new.captured_at) is distinct from (old.id,old.game_id,old.day,old.payload,old.captured_at)
  or (old.post_id is not null and (new.post_id,new.posted_at) is distinct from (old.post_id,old.posted_at)) then raise exception 'NHL chart snapshots are immutable';end if;
 return new;
end $function$
;

revoke all on function private.nhl_chart_immutable() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.normalize_kalshi_source_link(p text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare clean text; query text; part text; key text; ticker text; n integer:=0;
begin
 if p is null or length(p)=0 or length(p)>2048 or p ~ '[[:space:][:cntrl:]%]' or strpos(p,chr(92))>0 then return null;end if;
 if p !~ '^https://(www\.)?kalshi\.com/markets/kxmvecrosscategory/combo/[A-Za-z0-9_-]{1,200}(\?[^#]*)?(#.*)?$' then return null;end if;
 clean:=split_part(p,'#',1);
 query:=substring(clean from strpos(clean,'?')+1);
 foreach part in array string_to_array(query,'&') loop
  key:=split_part(part,'=',1);
  if position('ticker' in lower(key))>0 or lower(key) in ('market','event') then
   if key<>'marketTicker' then return null;end if;
   n:=n+1;ticker:=substring(part from length(key)+2);
   if ticker is null or ticker !~ '^[A-Za-z0-9_-]{1,200}$' then return null;end if;
  end if;
 end loop;
 if n<>1 then return null;end if;
 return split_part(clean,'?',1)||'?marketTicker='||ticker;
end $function$
;

revoke all on function private.normalize_kalshi_source_link(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_actor_followed(p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_actor is null or p_type in ('security','password_change','account')
 
 or exists(select 1 from public.member_follows f where f.user_id=p_recipient and f.target_user_id=p_actor)
$function$
;

revoke all on function private.notification_actor_followed(uuid,uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_block_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 delete from public.notifications n where (n.recipient_id=new.user_id and exists(select 1 from private.notification_events e where e.notification_id=n.id and e.actor_id=new.target_user_id)) or (n.recipient_id=new.target_user_id and exists(select 1 from private.notification_events e where e.notification_id=n.id and e.actor_id=new.user_id));return new;
end$function$
;

revoke all on function private.notification_block_cleanup() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_follow_inbox_allowed(p_id uuid, p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_recipient=auth.uid() and private.notification_group_followed(p_id,p_recipient,p_actor,p_type)
$function$
;

revoke all on function private.notification_follow_inbox_allowed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_group_followed(p_id uuid, p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.notification_actor_followed(p_recipient,p_actor,p_type)
 and not exists(select 1 from private.notification_events e where e.notification_id=p_id
  and not private.notification_actor_followed(p_recipient,e.actor_id,e.type))
$function$
;

revoke all on function private.notification_group_followed(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_interaction_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$declare total integer;begin
 insert into private.notification_action_rates(user_id,window_at,attempts) values(new.user_id,date_trunc('minute',now()),1) on conflict(user_id,window_at) do update set attempts=private.notification_action_rates.attempts+1 returning attempts into total;
 if total>60 then raise exception 'Please wait before adding more reactions or follows';end if;
 delete from private.notification_action_rates where user_id=new.user_id and window_at<now()-interval '1 day';
 new.created_at:=now();return new;
end$function$
;

revoke all on function private.notification_interaction_guard() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_pref_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone';end if;
 new.updated_at:=now();return new;end$function$
;

revoke all on function private.notification_pref_guard() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_pulse(p_device uuid, p_visible boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 insert into private.notification_presence(user_id,device,visible) values(auth.uid(),p_device,p_visible) on conflict(user_id,device) do update set last_seen=now(),visible=excluded.visible;
 delete from private.notification_presence where user_id=auth.uid() and last_seen<now()-interval '1 day';
end$function$
;

revoke all on function private.notification_pulse(uuid,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.notification_search_document(p_actor text, p_names text[], p_message text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$select p_actor||' '||coalesce(array_to_string(p_names,' '),'')||' '||p_message$function$
;

revoke all on function private.notification_search_document(text,text[],text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.personal_immutable_or_erasure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if TG_OP='DELETE' and current_user='postgres' and current_setting('vq.erasing_user',true)=old.user_id::text then return old;end if;
 raise exception 'Personal tracking history is immutable outside verified account erasure';
end $function$
;

revoke all on function private.personal_immutable_or_erasure() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.public_overview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('challenges',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'status',c.status,'current_stage',c.current_stage,'balance_cents',c.balance_cents,'wins',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='WIN'),'losses',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='LOSS')) order by c.number desc),'[]') from public.challenges c),'stages',(select coalesce(jsonb_agg(jsonb_build_object('stage_number',stage_number,'challenge_id',challenge_id,'game_id',game_id,'status',status) order by stage_number),'[]') from public.challenge_stages));
$function$
;

revoke all on function private.public_overview() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.publish(p_action text, p_payload jsonb, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p public.official_picks; g public.games; ch public.challenges; st public.challenge_stages; av public.analysis_versions; ent public.pick_entries; result_id uuid; entity_id uuid; v integer; gain integer; new_balance integer; receipt jsonb; k text; required_field text; kickoff timestamptz;
begin
 if not private.is_admin() then raise exception 'Admin access required'; end if;
 if octet_length(p_payload::text)>150000 then raise exception 'Publication exceeds 150 KB'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request_id::text));
 select response into receipt from private.publish_receipts where request_id=p_request_id;
 if found then return receipt; end if;
 if p_action in ('market','entry','close','result') and coalesce(trim(p_payload->>'source'),'')='' then raise exception 'A source is required'; end if;
 if p_action='game' then
  if exists(select 1 from public.official_picks where game_id=(p_payload->>'id')::uuid) then raise exception 'Game details are locked once an official pick is published'; end if;
  if exists(select 1 from public.games where id=(p_payload->>'id')::uuid and kickoff<=now()) then raise exception 'A started game cannot be rewritten. Publish a correction in analysis history.'; end if;
  foreach required_field in array array['slug','away_team','home_team','kickoff','venue','slot'] loop
   if coalesce(trim(p_payload->>required_field),'')='' then raise exception 'Missing game field: %',required_field; end if;
  end loop;
  insert into public.games(id,slug,away_team,home_team,kickoff,venue,slot) values(coalesce((p_payload->>'id')::uuid,gen_random_uuid()),p_payload->>'slug',p_payload->>'away_team',p_payload->>'home_team',(p_payload->>'kickoff')::timestamptz,p_payload->>'venue',p_payload->>'slot') on conflict(id) do update set slug=excluded.slug,away_team=excluded.away_team,home_team=excluded.home_team,kickoff=excluded.kickoff,venue=excluded.venue,slot=excluded.slot returning id into entity_id;
  if nullif(p_payload->>'stage_id','') is not null then
   select * into st from public.challenge_stages where id=(p_payload->>'stage_id')::uuid for update;
   if not found then raise exception 'Stage not found'; end if;
   if exists(select 1 from public.official_picks where stage_id=st.id) then raise exception 'Cannot replace a matchup with an official pick'; end if;
   update public.challenge_stages set game_id=entity_id,status='ANALYSIS IN PROGRESS' where id=st.id;
  end if;
 elsif p_action='market' then
  if (p_payload->>'observed_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Market timestamp cannot be in the future'; end if;
  insert into public.market_snapshots(game_id,observed_at,source,spread,moneyline,total,kind,notes) values((p_payload->>'game_id')::uuid,(p_payload->>'observed_at')::timestamptz,p_payload->>'source',p_payload->>'spread',p_payload->>'moneyline',p_payload->>'total',p_payload->>'kind',p_payload->>'notes') returning id into entity_id;
 elsif p_action='analysis' then
  perform 1 from public.games where id=(p_payload->>'game_id')::uuid for update;
  if not found then raise exception 'Game not found'; end if;
  select coalesce(max(version),0)+1 into v from public.analysis_versions where game_id=(p_payload->>'game_id')::uuid;
  insert into public.analysis_versions(game_id,version,title,sections,projections,raw_handoff,source) values((p_payload->>'game_id')::uuid,v,p_payload->>'title',coalesce(p_payload->'sections','{}'),coalesce(p_payload->'projections','{}'),p_payload->>'raw_handoff',coalesce(p_payload->>'source','Vegas Quant Ultra / owner handoff')) returning id into entity_id;
 elsif p_action='pick' then
  select * into g from public.games where id=(p_payload->>'game_id')::uuid for update;
  if not found or g.kickoff<=now() then raise exception 'Official recommendations must be published before kickoff'; end if;
  select * into av from public.analysis_versions where id=(p_payload->>'analysis_id')::uuid and game_id=g.id;
  if not found then raise exception 'Select a published analysis version for this game'; end if;
  foreach required_field in array array['selection','predicted_close','best_number','bet_grade','timing','why_like','why_lose','playable_number','pass_number','book','raw_handoff'] loop
   if coalesce(trim(p_payload->>required_field),'')='' then raise exception 'Missing required analyst field: %',required_field; end if;
  end loop;
  if nullif(p_payload->>'stage_id','') is not null then
   select * into st from public.challenge_stages where id=(p_payload->>'stage_id')::uuid;
   select * into ch from public.challenges where id=st.challenge_id for update;
   if st.game_id is distinct from g.id or st.stage_number<>ch.current_stage then raise exception 'Pick must match the current challenge stage'; end if;
   if ch.status in ('PASS / PAUSED','LOST','COMPLETED','OFFICIAL PLAY') then raise exception 'Challenge is paused, closed, or has an open pick'; end if;
   if (p_payload->>'stake_cents')::integer>ch.balance_cents then raise exception 'Stake exceeds challenge bankroll'; end if;
  end if;
  insert into public.official_picks(game_id,stage_id,analysis_id,market,selection,recommended_line,direction,odds,stake_cents,model_probability,market_probability,edge,confidence,risk,predicted_close,best_number,bet_grade,fear_index,timing,why_like,why_lose,playable_number,pass_number,book,raw_handoff,market_info_url,gambly_url,known_at_publication)
  values(g.id,st.id,av.id,p_payload->>'market',p_payload->>'selection',(p_payload->>'recommended_line')::numeric,nullif(p_payload->>'direction',''),(p_payload->>'odds')::numeric,(p_payload->>'stake_cents')::integer,(p_payload->>'model_probability')::numeric,(p_payload->>'market_probability')::numeric,(p_payload->>'edge')::numeric,(p_payload->>'confidence')::numeric,(p_payload->>'risk')::numeric,p_payload->>'predicted_close',p_payload->>'best_number',p_payload->>'bet_grade',(p_payload->>'fear_index')::numeric,p_payload->>'timing',p_payload->>'why_like',p_payload->>'why_lose',p_payload->>'playable_number',p_payload->>'pass_number',p_payload->>'book',p_payload->>'raw_handoff',nullif(p_payload->>'market_info_url',''),nullif(p_payload->>'gambly_url',''),jsonb_build_object('game',to_jsonb(g),'analysis',to_jsonb(av),'markets',(select coalesce(jsonb_agg(m order by observed_at desc),'[]') from public.market_snapshots m where m.game_id=g.id))) returning id into entity_id;
  if st.id is not null then
   update public.challenge_stages set status='OFFICIAL PLAY' where id=st.id;
   update public.challenges set status='OFFICIAL PLAY' where id=ch.id;
   insert into public.bankroll_transactions(challenge_id,pick_id,kind,amount_cents,balance_cents) values(ch.id,entity_id,'RESERVE',0,ch.balance_cents);
  end if;
 elsif p_action in ('entry','close','result','review') then
  select * into p from public.official_picks where id=(p_payload->>'pick_id')::uuid for update;
  if not found then raise exception 'Official pick not found'; end if;
  select games.kickoff into kickoff from public.games where id=p.game_id;
  if p_action='entry' then
   if (p_payload->>'bet_at')::timestamptz>=kickoff or (p_payload->>'bet_at')::timestamptz>now()+interval '5 minutes' then raise exception 'Actual bet time must precede kickoff and cannot be future-dated'; end if;
   if exists(select 1 from public.pick_results where pick_id=p.id) then raise exception 'Cannot add an entry after settlement'; end if;
   if p.market<>'Moneyline' and (p_payload->>'line') is null then raise exception 'Actual line required'; end if;
   if p.market='Moneyline' and (p_payload->>'line') is not null then raise exception 'Moneyline has no spread or total line'; end if;
   insert into public.pick_entries(pick_id,line,odds,source,bet_at) values(p.id,(p_payload->>'line')::numeric,(p_payload->>'odds')::numeric,p_payload->>'source',(p_payload->>'bet_at')::timestamptz) returning id into entity_id;
  elsif p_action='close' then
   if now()<kickoff then raise exception 'Record the close after kickoff'; end if;
   if (p_payload->>'observed_at')::timestamptz>kickoff or (p_payload->>'observed_at')::timestamptz<kickoff-interval '1 hour' then raise exception 'Closing timestamp must be within the hour before kickoff'; end if;
   if p.market<>'Moneyline' and (p_payload->>'line') is null then raise exception 'Closing line required'; end if;
   if p.market='Moneyline' and (p_payload->>'line') is not null then raise exception 'Moneyline has no spread or total line'; end if;
   insert into public.closing_lines(pick_id,line,odds,source,observed_at) values(p.id,(p_payload->>'line')::numeric,(p_payload->>'odds')::numeric,p_payload->>'source',(p_payload->>'observed_at')::timestamptz) returning id into entity_id;
  elsif p_action='result' then
   if now()<kickoff then raise exception 'Cannot settle before kickoff'; end if;
   select * into ent from public.pick_entries where pick_id=p.id;
   if not found then raise exception 'Confirm actual bet entry before settlement'; end if;
   if coalesce((p_payload->>'no_bet')::boolean,false) then raise exception 'Only confirmed actual bets can settle'; end if;
   gain=case p_payload->>'result' when 'WIN' then round(p.stake_cents*case when ent.odds>0 then ent.odds/100 else 100/abs(ent.odds) end)::integer when 'LOSS' then -p.stake_cents when 'PUSH' then 0 when 'VOID' then 0 else null end;
   if gain is null then raise exception 'Invalid result'; end if;
   if p.stage_id is not null then
    select * into st from public.challenge_stages where id=p.stage_id;
    select * into ch from public.challenges where id=st.challenge_id for update;
    new_balance=ch.balance_cents+gain;
   end if;
   insert into public.pick_results(pick_id,result,away_score,home_score,profit_cents,bankroll_cents,source) values(p.id,p_payload->>'result',(p_payload->>'away_score')::integer,(p_payload->>'home_score')::integer,gain,new_balance,p_payload->>'source') returning id into entity_id;
   if p.stage_id is not null then
    update public.challenge_stages set status=case p_payload->>'result' when 'WIN' then 'WON' when 'LOSS' then 'LOST' else 'PUSH' end where id=st.id;
    update public.challenges set balance_cents=new_balance,status=case when new_balance=0 then 'LOST' when st.stage_number=5 then 'COMPLETED' when p_payload->>'result'='LOSS' then 'PASS / PAUSED' when p_payload->>'result'='WIN' then 'WON' else 'PUSH' end,current_stage=case when new_balance>0 and st.stage_number<5 then st.stage_number+1 else st.stage_number end,pause_reason=case when p_payload->>'result'='LOSS' and new_balance>0 then 'Losing leg; explicit resume required for remaining capital.' else null end where id=ch.id;
    insert into public.bankroll_transactions(challenge_id,pick_id,kind,amount_cents,balance_cents) values(ch.id,p.id,'SETTLEMENT',gain,new_balance);
   end if;
  else
   if not exists(select 1 from public.pick_results where pick_id=p.id) then raise exception 'Settle pick before process grading'; end if;
   insert into public.process_reviews(pick_id,grade,classification,lessons) values(p.id,p_payload->>'grade',p_payload->>'classification',p_payload->>'lessons') returning id into entity_id;
  end if;
 elsif p_action in ('pause','resume') then
  select * into ch from public.challenges where id=(p_payload->>'challenge_id')::uuid for update;
  if not found then raise exception 'Challenge not found'; end if;
  if ch.status in ('OFFICIAL PLAY','LOST','COMPLETED') then raise exception 'Cannot pause or resume a closed challenge or an open official play'; end if;
  if coalesce(trim(p_payload->>'reason'),'')='' then raise exception 'A reason is required'; end if;
  if p_action='pause' then
   update public.challenges set status='PASS / PAUSED',pause_reason=p_payload->>'reason' where id=ch.id;
   update public.challenge_stages set status='PASS / PAUSED',pass_reason=p_payload->>'reason' where challenge_id=ch.id and stage_number=ch.current_stage;
  else
   if ch.status<>'PASS / PAUSED' then raise exception 'Only a paused challenge can resume'; end if;
   v=coalesce((p_payload->>'next_stage')::integer,ch.current_stage);
   if v<ch.current_stage or v>5 then raise exception 'Choose the current or a later stage'; end if;
   if exists(select 1 from public.official_picks op join public.challenge_stages cs on cs.id=op.stage_id where cs.challenge_id=ch.id and cs.stage_number=v) then raise exception 'This stage already has a pick'; end if;
   update public.challenges set status='ANALYSIS IN PROGRESS',pause_reason=null,current_stage=v where id=ch.id;
   update public.challenge_stages set status='ANALYSIS IN PROGRESS' where challenge_id=ch.id and stage_number=v;
  end if;
  entity_id=ch.id;
  insert into public.audit_events(entity,entity_id,action,detail) values('challenge_decision',ch.id,upper(p_action),p_payload);
 elsif p_action='new_challenge' then
  if exists(select 1 from public.challenges where status not in ('COMPLETED','LOST')) then raise exception 'Complete the active challenge before creating another'; end if;
  insert into public.challenges default values returning id into entity_id;
  insert into public.challenge_stages(challenge_id,stage_number,slot) select entity_id,n,case n when 1 then 'Thursday Night Football' when 2 then 'Sunday · 1 PM' when 3 then 'Sunday · 4 PM' when 4 then 'Sunday Night Football' else 'Monday Night Football' end from generate_series(1,5) n;
  insert into public.bankroll_transactions(challenge_id,kind,amount_cents,balance_cents) values(entity_id,'START',2000,2000);
 else raise exception 'Unknown publishing action'; end if;
 receipt=jsonb_build_object('id',entity_id,'action',p_action);
 insert into private.publish_receipts(request_id,action,response) values(p_request_id,p_action,receipt);
 return receipt;
end $function$
;

revoke all on function private.publish(text,jsonb,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.published_leg_recommendation(p_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l record; d record; c jsonb; s jsonb; price numeric; probability numeric; edge numeric; url text;
begin
 if auth.uid() is null or not private.has_membership() then return null; end if;
 select * into l from public.published_legs where leg_key=p_key;
 if not found or l.result is not null or l.expires_at<=now() then return null; end if;
 select * into d from private.nfl_selection_gate_decisions
 where accepted and entity_id=coalesce(l.release_id,l.official_pick_id)
 and entity=case when l.release_id is null then 'official_picks' else 'candidate_releases' end
 order by created_at desc limit 1;
 if not found then return null; end if;
 c:=d.evidence->(coalesce(l.leg_index,1)-1); s:=c->'selection_gate';
 if c->>'analysis_kind' like '%SHADOW%' or c->>'experimental'='true' then return null; end if;
 select validation_url into url from private.nfl_selection_model_approvals
 where model_id=s->>'model_id' and approved_at<=l.published_at;
 if not found then return null; end if;
 probability:=private.nfl_gate_number(s->'model_probability');price:=private.nfl_gate_number(c->'odds');
 if probability is null or probability not between 0 and 1 or price is null or abs(price)<100 then return null; end if;
 -- Current badges expire with the reviewed exact quote. A past estimate is not a fresh recommendation.
 if private.nfl_gate_time(c->>'quote_observed_at') is null or private.nfl_gate_time(c->>'quote_observed_at')<now()-interval '15 minutes' or private.nfl_gate_time(c->>'quote_observed_at')>now() then return null; end if;
 edge:=probability-case when price<0 then abs(price)/(abs(price)+100) else 100/(price+100) end;
 if edge<0.03 then return null; end if;
 return jsonb_build_object('edge_pp',round(edge*100,2),'model_id',s->>'model_id','validation_url',url);
end $function$
;

revoke all on function private.published_leg_recommendation(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.recent_ruby_card_comment()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (select 1 from public.ruby_card_comments where user_id=auth.uid() and created_at>now()-interval '10 seconds')
$function$
;

revoke all on function private.recent_ruby_card_comment() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.record_onboarding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare e text; begin
 if tg_table_name='saved_legs' then e:='first_saved_leg';
 elsif tg_table_name='push_subscriptions' then e:='notifications_enabled';
 elsif new.avatar is not null and new.username !~* '^Member_[a-f0-9]{8}$' then e:='profile_completed'; end if;
 if e is not null then insert into public.onboarding_events(user_id,event) values(new.user_id,e) on conflict do nothing;end if;return new;end $function$
;

revoke all on function private.record_onboarding() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.require_cleared_personal_run()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if coalesce((select payout_pending from public.personal_run_events where personal_challenge_id=new.personal_challenge_id order by id desc limit 1),false) then
  raise exception 'Payout pending — your run is paused. Confirm funds have cleared before recording the next entry.';
 end if;
 return new;
end $function$
;

revoke all on function private.require_cleared_personal_run() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.require_research_model_basis()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare t jsonb; begin
 for t in select value from jsonb_array_elements(coalesce(new.intelligence->'targets','[]')) loop
  if t->>'status' <> 'OFFICIAL' and ((t->>'model_probability') is not null or (t->>'edge') is not null or t->>'status'='BETTABLE') and length(coalesce(trim(t->>'model_basis'),''))<40 then
   raise exception 'Numeric research targets require documented model inputs, assumptions and source; otherwise WAIT/PASS with unknown estimates';
  end if;
  if t->>'status'='BETTABLE' and ((t->>'edge') is null or (t->>'edge')::numeric<3 or (t->>'model_probability') is null or (t->>'market_probability') is null) then
   raise exception 'BETTABLE requires supplied probabilities and at least 3 percentage points of edge';
  end if;
 end loop;
 return new;
end $function$
;

revoke all on function private.require_research_model_basis() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ruby_card_open(p_card uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (select 1 from public.ruby_submissions s where s.id=p_card and coalesce(private.ruby_visible(s.user_id),false))
  and exists (select 1 from public.ruby_cards c where c.id=p_card and not c.hidden)
$function$
;

revoke all on function private.ruby_card_open(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ruby_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when private.age_member_allowed() then jsonb_build_object('user_id',auth.uid(),'day',(now() at time zone 'America/New_York')::date,'contributor',(select to_jsonb(c) from public.ruby_contributors c where c.user_id=auth.uid() and c.active),'submitted',(select id from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date order by created_at desc limit 1),'submission_count',(select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date),'admin',public.is_admin(),'due',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (select s.id,s.brand,coalesce(r.title,s.title) title,s.created_at,coalesce(r.revision,0) revision,coalesce(r.legs,s.legs) legs,case when r.id is null then s.photo_path else r.photo_path end photo_path,case when r.id is null then s.source_link else r.source_link end source_link from public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true left join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) rr on true where s.user_id=auth.uid() and s.submission_day<(now() at time zone 'America/New_York')::date and (rr.id is null or rr.revision<>coalesce(r.revision,0) or (rr.outcome='PENDING' and (rr.reported_at at time zone 'America/New_York')::date<(now() at time zone 'America/New_York')::date))) x)) else '{}'::jsonb end$function$
;

revoke all on function private.ruby_home() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.ruby_visible(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.age_member_allowed() and private.community_member_allowed(p_user) and not exists(select 1 from private.community_restrictions where user_id=p_user)$function$
;

revoke all on function private.ruby_visible(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.set_community_poll_vote(p_post uuid, p_option integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); author uuid; n integer;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community vote unavailable'; end if;
 select p.user_id, jsonb_array_length(pl.options) into author, n
  from public.community_polls pl join public.community_posts p on p.id = pl.post_id
  where pl.post_id = p_post for key share of pl;
 if author is null or not coalesce(private.community_member_allowed(author), false) then
  raise exception 'Poll unavailable'; end if;
 if p_option is not null and (p_option < 0 or p_option >= n) then raise exception 'Unknown poll option'; end if;
 if p_option is null then
  delete from public.community_poll_votes where post_id = p_post and user_id = actor;
 else
  insert into public.community_poll_votes(post_id, user_id, option_index) values (p_post, actor, p_option)
  on conflict (post_id, user_id) do update set option_index = excluded.option_index, created_at = now();
 end if;
 return (select value from jsonb_array_elements(public.community_poll_states(array[p_post])) limit 1);
end $function$
;

revoke all on function private.set_community_poll_vote(uuid,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.set_community_post_vote(p_post uuid, p_value integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); author uuid;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community vote unavailable'; end if;
 if p_value is not null and p_value not in (-1, 0, 1) then raise exception 'Unsupported vote'; end if;
 select user_id into author from public.community_posts where id = p_post for key share;
 if author is null or not coalesce(private.community_member_allowed(author), false) then
  raise exception 'Post unavailable'; end if;
 if coalesce(p_value, 0) = 0 then
  delete from public.community_post_votes where post_id = p_post and user_id = actor;
 else
  insert into public.community_post_votes(post_id, user_id, value) values (p_post, actor, p_value)
  on conflict (post_id, user_id) do update set value = excluded.value, created_at = now();
 end if;
 return (select value from jsonb_array_elements(public.community_vote_states(array[p_post])) limit 1);
end $function$
;

revoke all on function private.set_community_post_vote(uuid,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.set_community_reaction(p_post uuid, p_reaction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); target uuid; previous text;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community reaction unavailable';end if;
 if p_reaction is not null and p_reaction not in ('heart','celebrate','fire','thinking') then
  raise exception 'Unsupported reaction';end if;
 perform pg_advisory_xact_lock(hashtextextended('community-reaction:'||actor::text||':'||p_post::text,0));
 select user_id into target from public.community_posts where id=p_post for key share;
 if target is null or not coalesce(private.community_member_allowed(target),false) then
  raise exception 'Post unavailable';end if;
 select reaction_type into previous from public.community_reactions where post_id=p_post and user_id=actor for update;
 if previous is distinct from p_reaction then
  delete from public.community_reactions where post_id=p_post and user_id=actor;
  if p_reaction is not null then
   -- Original safety, rate and notification triggers still run. Any error rolls back
   -- this entire function call, including the deleted previous selection.
   insert into public.community_reactions(post_id,user_id,reaction_type) values(p_post,actor,p_reaction);
  end if;
 end if;
 return public.community_reaction_state(p_post);
end $function$
;

revoke all on function private.set_community_reaction(uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.settle_personal_entries()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare graded_line numeric;
begin
 -- Results describe the official actual entry, which may differ from publication.
 select line into graded_line from public.pick_entries where pick_id=new.pick_id;
 if not found then return new; end if;
 insert into public.personal_settlements(entry_id,user_id,result,profit_cents,source)
 select e.id,e.user_id,new.result,
 case new.result when 'WIN' then e.payout_cents-e.stake_cents when 'LOSS' then -e.stake_cents else 0 end,
 'Official result '||new.id::text||' / matching actual line'
 from public.personal_entry_state e where e.pick_id=new.pick_id and e.line is not distinct from graded_line
 on conflict(entry_id) do nothing;
 return new;
end $function$
;

revoke all on function private.settle_personal_entries() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.signup_trial_expires_at()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select created_at + interval '14 days' from auth.users where id=auth.uid() and not coalesce(is_anonymous,false);
$function$
;

revoke all on function private.signup_trial_expires_at() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.stamp_intelligence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 new.created_at=clock_timestamp(); new.created_by=auth.uid();
 if tg_table_name in ('intelligence_quotes','intelligence_splits') then
  if (select market_type='Moneyline' from public.intelligence_markets where id=new.market_id) is distinct from (new.line is null) then
   raise exception 'Moneylines require an empty line; sides, totals and props require a line';
  end if;
 end if;
 return new;
end $function$
;

revoke all on function private.stamp_intelligence() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.submit_ruby(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text, p_photo text, p_book text, p_odds integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare contributor public.ruby_contributors; existing public.ruby_submissions; leg jsonb;
begin
 if auth.uid() is null or not private.age_member_allowed() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in and complete account verification first'; end if;
 if exists(select 1 from private.community_restrictions where user_id=auth.uid()) then raise exception 'Posting is unavailable for this account';end if;
 select * into contributor from public.ruby_contributors where user_id=auth.uid() and active;
 if not found then raise exception 'Contributor access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,741));
 select * into existing from public.ruby_submissions where id=p_id;
 if found then
  if existing.source_link is null and existing.user_id=auth.uid() and existing.sport=p_sport and existing.title=btrim(p_title) and existing.legs=p_legs and existing.note=btrim(p_note) and existing.photo_path is not distinct from p_photo and existing.sportsbook is not distinct from nullif(btrim(p_book),'') and existing.reported_odds is not distinct from p_odds then return existing.id;end if;
  raise exception 'Submission identifier already used';
 end if;
 if (select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date)>=3 then raise exception 'All three daily slips are published. Come back after midnight Eastern.';end if;
 if not exists(select 1 from public.community_profiles where user_id=auth.uid() and visible and avatar is not null and username !~ '^Member_') then raise exception 'Finish your community profile before posting';end if;
 if p_legs is null or jsonb_typeof(p_legs)<>'array' or jsonb_array_length(p_legs)>20 then raise exception 'Enter up to 20 legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
  if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;
 end loop;
 if p_photo is not null and (p_photo<>auth.uid()::text||'/'||p_id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text)) then raise exception 'Upload your own screenshot first';end if;
 insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,legs,note,photo_path,sportsbook,reported_odds)
 values(p_id,auth.uid(),contributor.brand,contributor.theme,p_sport,btrim(p_title),p_legs,btrim(p_note),p_photo,nullif(btrim(p_book),''),p_odds);
 return p_id;
end $function$
;

revoke all on function private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.submit_ruby_link(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text, p_photo text, p_book text, p_odds integer, p_source_link text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare contributor public.ruby_contributors; existing public.ruby_submissions; leg jsonb;
begin
 p_source_link:=private.normalize_kalshi_source_link(p_source_link);
 if p_source_link is null then raise exception 'Invalid Kalshi source link';end if;
 if exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now()) then raise exception 'Account deletion in progress';end if;
 if auth.uid() is null or not private.age_member_allowed() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Sign in and complete account verification first'; end if;
 if exists(select 1 from private.community_restrictions where user_id=auth.uid()) then raise exception 'Posting is unavailable for this account';end if;
 select * into contributor from public.ruby_contributors where user_id=auth.uid() and active;
 if not found then raise exception 'Contributor access required';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,741));
 select * into existing from public.ruby_submissions where id=p_id;
 if found then
  if existing.source_link is not distinct from p_source_link and existing.user_id=auth.uid() and existing.sport=p_sport and existing.title=btrim(p_title) and existing.legs=p_legs and existing.note=btrim(p_note) and existing.photo_path is not distinct from p_photo and existing.sportsbook is not distinct from nullif(btrim(p_book),'') and existing.reported_odds is not distinct from p_odds then return existing.id;end if;
  raise exception 'Submission identifier already used';
 end if;
 if (select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date)>=3 then raise exception 'All three daily slips are published. Come back after midnight Eastern.';end if;
 if not exists(select 1 from public.community_profiles where user_id=auth.uid() and visible and avatar is not null and username !~ '^Member_') then raise exception 'Finish your community profile before posting';end if;
 if p_legs is null or jsonb_typeof(p_legs)<>'array' or jsonb_array_length(p_legs)>20 then raise exception 'Enter up to 20 legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
  if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;
 end loop;
 if p_photo is not null and (p_photo<>auth.uid()::text||'/'||p_id::text||'.jpg' or not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text)) then raise exception 'Upload your own screenshot first';end if;
 insert into public.ruby_submissions(id,user_id,brand,theme,sport,title,legs,note,photo_path,sportsbook,reported_odds,source_link)
 values(p_id,auth.uid(),contributor.brand,contributor.theme,p_sport,btrim(p_title),p_legs,btrim(p_note),p_photo,nullif(btrim(p_book),''),p_odds,p_source_link);
 return p_id;
end $function$
;

revoke all on function private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.validate_nba_editorial_pick()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare g public.nba_games; o public.nba_observations; s jsonb;
begin
 select * into g from public.nba_games where id=new.game_id;
 if g.id is null or g.season_type is distinct from 2 or g.tipoff_tbd or g.tipoff<=now()
    or coalesce(g.status,'') ~ 'FINAL|IN_PROGRESS|HALFTIME|END_PERIOD|CANCEL|POSTPON|SUSPEND' then
  raise exception 'NBA_EDITORIAL_BLOCKED: upcoming regular-season game required';
 end if;
 select * into o from public.nba_observations where id=new.quote_observation_id;
 if o.id is null or o.game_id<>g.id or o.kind<>'prop'
    or o.payload->>'book' is distinct from new.book or o.payload->>'market' is distinct from new.market
    or o.observed_at is null or o.observed_at>now() or o.recorded_at>now()
    or o.observed_at<now()-interval '8 hours'
    or not exists(select 1 from jsonb_array_elements(o.payload->'outcomes') x
      where x->>'description'=new.player and x->>'name'=new.direction
       and (x->>'point')::numeric=new.line and (x->>'price')::integer=new.odds) then
  raise exception 'NBA_EDITORIAL_BLOCKED: exact recent NBA sportsbook observation required';
 end if;
 if coalesce(new.evidence->>'historical_cutoff','')='' or
    (new.evidence->>'historical_cutoff')::timestamptz>now() or
    coalesce(new.evidence->>'input_sha256','') !~ '^[a-f0-9]{64}$' or
    coalesce(new.evidence->>'availability_review','')='' or
    coalesce(new.evidence->>'role_review','')='' then
  raise exception 'NBA_EDITORIAL_BLOCKED: timestamped role and availability evidence required';
 end if;
 for s in select * from jsonb_array_elements(new.sources) loop
  if coalesce(s->>'url','') not like 'https://%' or coalesce(s->>'label','')='' then
   raise exception 'NBA_EDITORIAL_BLOCKED: source link required';
  end if;
 end loop;
 if new.supersedes_id is not null and not exists(select 1 from public.nba_editorial_picks p
    where p.id=new.supersedes_id and p.game_id=new.game_id and p.player=new.player and p.market=new.market) then
  raise exception 'NBA_EDITORIAL_BLOCKED: update must reference same original player and market';
 end if;
 new.published_at:=now(); new.expires_at:=g.tipoff;
 new.quote_observed_at:=o.observed_at; new.quote_recorded_at:=o.recorded_at;
 new.quote_source_url:=o.source;
 return new;
end $function$
;

revoke all on function private.validate_nba_editorial_pick() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.validate_nba_editorial_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare current_id uuid; s jsonb;
begin
 if jsonb_typeof(new.evidence->'source_files') is distinct from 'array'
    or jsonb_array_length(new.evidence->'source_files')<2
    or coalesce(new.evidence->>'generated_at','')=''
    or (new.evidence->>'generated_at')::timestamptz>now()
    or (new.evidence->>'historical_cutoff')::timestamptz>(new.evidence->>'generated_at')::timestamptz
    or new.evidence->>'quote_observation_id' is distinct from new.quote_observation_id::text then
  raise exception 'NBA_EDITORIAL_BLOCKED: complete timestamped source provenance required';
 end if;
 for s in select * from jsonb_array_elements(new.evidence->'source_files') loop
  if coalesce(s->>'url','') not like 'https://%'
     or coalesce(s->>'sha256','') !~ '^[a-f0-9]{64}$'
     or coalesce(s->>'retrieved_at','')=''
     or (s->>'retrieved_at')::timestamptz>now() then
   raise exception 'NBA_EDITORIAL_BLOCKED: source hash and retrieval time required';
  end if;
 end loop;
 if new.evidence->>'input_sha256' is distinct from
    encode(sha256(convert_to((new.evidence-'input_sha256'-'input_hash_format')::text,'UTF8')),'hex') then
  raise exception 'NBA_EDITORIAL_BLOCKED: evidence hash mismatch';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(concat_ws('|',new.game_id::text,new.player,new.market),0));
 select p.id into current_id from public.nba_editorial_picks p
 where p.game_id=new.game_id and p.player=new.player and p.market=new.market
 and not exists(select 1 from public.nba_editorial_picks successor where successor.supersedes_id=p.id);
 if new.supersedes_id is distinct from current_id then
  raise exception 'NBA_EDITORIAL_BLOCKED: revision must supersede the current publication';
 end if;
 return new;
end $function$
;

revoke all on function private.validate_nba_editorial_provenance() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.validate_nba_editorial_quote_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if (new.evidence->>'generated_at')::timestamptz < greatest(new.quote_recorded_at,new.quote_observed_at) then
  raise exception 'NBA_EDITORIAL_BLOCKED: evidence must follow quote observation and receipt';
 end if;
 return new;
end $function$
;

revoke all on function private.validate_nba_editorial_quote_timeline() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.validate_nba_editorial_source_timeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare s jsonb;
begin
 for s in select * from jsonb_array_elements(new.evidence->'source_files') loop
  if (s->>'retrieved_at')::timestamptz>(new.evidence->>'generated_at')::timestamptz then
   raise exception 'NBA_EDITORIAL_BLOCKED: sources must be retrieved before evidence generation';
  end if;
 end loop;
 return new;
end $function$
;

revoke all on function private.validate_nba_editorial_source_timeline() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.zone_editorial_leg(p_id uuid, p_user uuid, p_sport text, p_title text, p_body text, p_at timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when length(split_part(p_body,E'\n\n',1)) between 1 and 180 then split_part(p_body,E'\n\n',1) else p_title end
 where (p_sport='nba' and exists(select 1 from public.nba_editorial_picks n
  where md5('nba-editorial-zone:'||n.publication_key)::uuid=p_id and n.published_at=p_at
   and position(n.rationale in p_body)>0 and position(n.risk in p_body)>0 and position(n.unknowns in p_body)>0))
 or (p_sport in ('nhl','ncaab') and (select count(*) from public.sports_selections s join public.sports_games g on g.id=s.game_id
  where s.author_id=p_user and g.sport=p_sport and s.title=p_title and s.published_at=p_at
   and p_body=split_part(p_body,E'\n\n',1)||E'\n\n'||trim(s.why)||E'\n\nRisk: '||trim(s.risk)||
    E'\n\nVegas Quant editorial read, not a guaranteed result. Prices move; check the current line.')=1)
$function$
;

revoke all on function private.zone_editorial_leg(uuid,uuid,text,text,text,timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.zone_like(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')$function$
;

revoke all on function private.zone_like(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.zone_rx(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select regexp_replace(trim(p), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')$function$
;

revoke all on function private.zone_rx(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.zone_side_rx(p_sport text, p_name text, p_short text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select string_agg(distinct private.zone_rx(n), '|') from unnest(array[
  p_name, p_short,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then regexp_replace(p_name, '^\S+\s+', '') end,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then substring(p_name from '\S+$') end
 ]) n where n is not null and length(trim(n)) >= 3
$function$
;

revoke all on function private.zone_side_rx(text,text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.add_ruby_card_comment(p_card uuid, p_body text, p_parent uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid := auth.uid(); username text; parent public.ruby_card_comments; saved public.ruby_card_comments;
begin
 if not private.community_reaction_actor_allowed() then raise exception 'Community posting unavailable'; end if;
 select p.username into username from public.community_profiles p where p.user_id=actor and p.visible
  and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$';
 if username is null then raise exception 'Complete and enable your community profile first'; end if;
 if p_body is null or length(trim(p_body)) not between 1 and 1000 then raise exception 'Write 1 to 1000 characters'; end if;
 if p_body ~* '(guaranteed (profit|returns|win)|risk[- ]free (bet|profit)|kill yourself|i will kill you|javascript:|<script)' then
  raise exception 'Remove harmful content, executable links or guaranteed-return claims'; end if;
 -- Same per-member lock and gap as post comments, across both kinds of comment.
 perform pg_advisory_xact_lock(hashtextextended(actor::text,420));
 if exists (select 1 from public.community_post_comments where user_id=actor and created_at>now()-interval '10 seconds')
  or exists (select 1 from public.ruby_card_comments where user_id=actor and created_at>now()-interval '10 seconds') then
  raise exception 'Wait ten seconds between comments'; end if;
 perform 1 from public.ruby_submissions where id=p_card for key share;
 if not found or not private.ruby_card_open(p_card) then raise exception 'Card unavailable'; end if;
 if p_parent is not null then
  select * into parent from public.ruby_card_comments where id=p_parent;
  if parent.id is null or parent.card_id<>p_card or not coalesce(private.community_member_allowed(parent.user_id),false) then
   raise exception 'Comment unavailable'; end if;
 end if;
 insert into public.ruby_card_comments(card_id, user_id, parent_id, author_name, body)
  values (p_card, actor, p_parent, username, trim(p_body)) returning * into saved;
 return jsonb_build_object('id',saved.id,'card_id',saved.card_id,'user_id',saved.user_id,'parent_id',saved.parent_id,
  'author_name',saved.author_name,'body',saved.body,'created_at',saved.created_at);
end $function$
;

revoke all on function public.add_ruby_card_comment(uuid,text,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_activity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.community_activity() $function$
;

revoke all on function public.community_activity() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_avatars(p_users uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not (select private.age_member_allowed()) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'avatar', cp.avatar,
   'staff', exists(select 1 from private.admin_users a where a.user_id = cp.user_id)))
  from public.community_profiles cp join auth.users u on u.id = cp.user_id
  where cp.user_id = any(p_users[1:100]) and cp.visible
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
   and private.community_member_allowed(cp.user_id)), '[]'::jsonb);
end $function$
;

revoke all on function public.community_avatars(uuid[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_comments(p_post uuid, p_target uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
 select c.*,(select count(*) from public.community_comment_reactions r where r.comment_id=c.id) as reactions,
 exists(select 1 from public.community_comment_reactions r where r.comment_id=c.id and r.user_id=auth.uid()) as reacted
 from public.community_post_comments c where c.post_id=p_post and (c.id in(select id from public.community_post_comments where post_id=p_post order by created_at desc limit 50) or c.id=p_target)
 ) x;
$function$
;

revoke all on function public.community_comments(uuid,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_feed(p_sport text DEFAULT 'nfl'::text, p_limit integer DEFAULT 20, p_following boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.*,(select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
 exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
 (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
 exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
 from public.community_posts p where (p_sport='all' or p.sport=p_sport) and (not p_following or exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id))
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,100))
 )x
$function$
;

revoke all on function public.community_feed(text,integer,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_poll_states(p_posts uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(), false) then return '[]'::jsonb; end if;
 if coalesce(cardinality(p_posts), 0) > 100 then raise exception 'Too many posts'; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'post_id', pl.post_id, 'question', pl.question, 'options', pl.options,
   'counts', (select jsonb_agg((select count(*) from public.community_poll_votes v
                 where v.post_id = pl.post_id and v.option_index = i.n) order by i.n)
              from generate_series(0, jsonb_array_length(pl.options) - 1) as i(n)),
   'total', (select count(*) from public.community_poll_votes v where v.post_id = pl.post_id),
   'mine', (select v.option_index from public.community_poll_votes v
            where v.post_id = pl.post_id and v.user_id = auth.uid())))
  from public.community_polls pl join public.community_posts p on p.id = pl.post_id
  where pl.post_id = any(p_posts)
   and (private.community_member_allowed(p.user_id) or public.is_admin())), '[]'::jsonb);
end $function$
;

revoke all on function public.community_poll_states(uuid[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_post(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select to_jsonb(x) from (
  select p.*,
   (select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
   exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
   (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
   exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
  from public.community_posts p where p.id=p_id and private.community_member_allowed(p.user_id)
 ) x
$function$
;

revoke all on function public.community_post(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_profile(p_username text, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 me uuid := auth.uid();
 p public.community_profiles;
 since timestamptz;
begin
 if me is null or not coalesce(private.age_member_allowed(), false) then return null; end if;
 select cp.* into p from public.community_profiles cp join auth.users u on u.id = cp.user_id
 where case
   when p_username ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     then cp.user_id::text = lower(p_username)
   else lower(cp.username) = lower(p_username)
 end
  and (cp.user_id = me or cp.visible)
  and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
       );
 if not found then return null; end if;
 if p.user_id <> me and not coalesce(private.community_member_allowed(p.user_id), false) then return null; end if;
 select created_at into since from auth.users where id = p.user_id;
 return jsonb_build_object(
  'user_id', p.user_id,
  'username', p.username,
  'avatar', p.avatar,
  'region', p.region,
  'tagline', p.tagline,
  'bio', p.bio,
  'state', p.state,
  'instagram_url', p.instagram_url,
  'x_url', p.x_url,
  'member_since', since,
  'is_me', p.user_id = me,
  'i_follow', exists (select 1 from public.member_follows f where f.user_id = me and f.target_user_id = p.user_id),
  'followers', (select count(*) from public.member_follows f where f.target_user_id = p.user_id),
  'following', (select count(*) from public.member_follows f where f.user_id = p.user_id),
  'post_count', (select count(*) from public.community_posts c where c.user_id = p.user_id),
  'posts', coalesce((
   select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select c.id, c.sport, c.kind, c.title, c.body, c.legs, c.photo_path, c.card, c.created_at,
     (select count(*) from public.community_reactions r where r.post_id = c.id) as reactions,
     (select count(*) from public.community_post_comments k where k.post_id = c.id) as comments
    from public.community_posts c where c.user_id = p.user_id
    order by c.created_at desc, c.id desc limit greatest(1, least(coalesce(p_limit, 30), 60))
   ) x), '[]'::jsonb)
 );
end $function$
;

revoke all on function public.community_profile(text,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_reaction_state(p_post uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null;end if;
 if not exists(select 1 from public.community_posts p where p.id=p_post
  and private.community_member_allowed(p.user_id)) then return null;end if;
 return (select jsonb_build_object('version',1,'post_id',p_post,'total',count(*),
  'counts',jsonb_build_object('heart',count(*) filter(where reaction_type='heart'),
   'celebrate',count(*) filter(where reaction_type='celebrate'),
   'fire',count(*) filter(where reaction_type='fire'),
   'thinking',count(*) filter(where reaction_type='thinking')),
  'mine',max(reaction_type) filter(where user_id=auth.uid()))
  from public.community_reactions where post_id=p_post);
end $function$
;

revoke all on function public.community_reaction_state(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_story_clock()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when auth.uid() is not null then
  jsonb_build_object('version', 1, 'server_now', statement_timestamp())
 else null end
$function$
;

revoke all on function public.community_story_clock() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.community_vote_states(p_posts uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(), false) then return '[]'::jsonb; end if;
 if coalesce(cardinality(p_posts), 0) > 100 then raise exception 'Too many posts'; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'post_id', p.id,
   'up', coalesce(v.up, 0), 'down', coalesce(v.down, 0), 'score', coalesce(v.up, 0) - coalesce(v.down, 0),
   'mine', v.mine))
  from public.community_posts p
  left join lateral (
   select count(*) filter (where value = 1) up, count(*) filter (where value = -1) down,
    max(value) filter (where user_id = auth.uid()) mine
   from public.community_post_votes where post_id = p.id) v on true
  where p.id = any(p_posts)
   and (private.community_member_allowed(p.user_id) or public.is_admin())), '[]'::jsonb);
end $function$
;

revoke all on function public.community_vote_states(uuid[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_community_poll_post(p_id uuid, p_sport text, p_body text, p_photo_path text, p_question text, p_options jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 insert into public.community_posts(id, user_id, sport, kind, title, body, legs, stake, photo_path)
 values (p_id, auth.uid(), p_sport, 'talk', 'Community poll', coalesce(nullif(btrim(p_body), ''), btrim(p_question)),
  '[]'::jsonb, null, p_photo_path);
 insert into public.community_polls(post_id, question, options) values (p_id, p_question, p_options);
 return p_id;
end $function$
;

revoke all on function public.create_community_poll_post(uuid,text,text,text,text,jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_member_parlay(p_title text, p_leg_keys text[])
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.create_member_parlay(p_title,p_leg_keys)$function$
;

revoke all on function public.create_member_parlay(text,text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delete_ruby_card_comment(p_comment uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 delete from public.ruby_card_comments where id=p_comment and (user_id=auth.uid() or coalesce(public.is_admin(),false));
 if not found then raise exception 'Comment unavailable'; end if;
 return true;
end $function$
;

revoke all on function public.delete_ruby_card_comment(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.desk_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select case when private.has_membership() then jsonb_build_object(
 'access',public.membership_status(), 'overview',private.public_overview(),
 'games',(select coalesce(jsonb_agg(t order by kickoff),'[]') from public.games t),
 'challenges',(select coalesce(jsonb_agg(t order by number desc),'[]') from public.challenges t),
 'stages',(select coalesce(jsonb_agg(t order by stage_number),'[]') from public.challenge_stages t),
 'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from public.market_snapshots t),
 'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from public.analysis_versions t),
 'picks',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.official_picks t),
 'entries',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_entries t),
 'closings',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.closing_lines t),
 'results',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_results t),
 'reviews',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.process_reviews t),
 'transactions',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.bankroll_transactions t),
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t)) else private.free_challenge_desk() end; $function$
;

revoke all on function public.desk_data() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.desk_data_compact()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select case when private.has_membership() then jsonb_build_object(
 'access',public.membership_status(), 'overview',private.public_overview(),
 'games',(select coalesce(jsonb_agg(t order by kickoff),'[]') from public.games t),
 'challenges',(select coalesce(jsonb_agg(t order by number desc),'[]') from public.challenges t),
 'stages',(select coalesce(jsonb_agg(t order by stage_number),'[]') from public.challenge_stages t),
 'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from (select * from public.market_snapshots order by observed_at desc,created_at desc,id desc limit 200) t),
 'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from (select distinct on (game_id) * from public.analysis_versions order by game_id,created_at desc,version desc) t),
 'picks',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.official_picks t),
 'entries',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_entries t),
 'closings',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.closing_lines t),
 'results',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_results t),
 'reviews',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.process_reviews t),
 'transactions',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.bankroll_transactions t),
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from (select * from public.audit_events where false) t)) else private.free_challenge_desk() end; $function$
;

revoke all on function public.desk_data_compact() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.edit_ruby(p_submission uuid, p_expected integer, p_title text, p_legs jsonb, p_note text, p_sport text, p_book text, p_odds integer, p_photo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare original public.ruby_submissions; latest public.ruby_card_revisions; rid uuid:=gen_random_uuid(); n integer; leg jsonb;
begin
 if private.is_admin() is distinct from true then raise exception 'Verified admin required';end if;
 select * into original from public.ruby_submissions where id=p_submission for update;
 if not found then raise exception 'Card not found';end if;
 select * into latest from public.ruby_card_revisions where submission_id=p_submission order by revision desc limit 1;
 n:=coalesce(latest.revision,0);
 if p_expected is distinct from n then raise exception 'Card changed. Reload before editing.';end if;
 if jsonb_typeof(p_legs) is distinct from 'array' then raise exception 'Invalid legs';end if;
 for leg in select value from jsonb_array_elements(p_legs) loop
 if jsonb_typeof(leg)<>'string' or length(btrim(leg#>>'{}')) not between 1 and 180 then raise exception 'Each leg must be 1 to 180 characters';end if;end loop;
 if p_photo is not null and p_photo is distinct from coalesce(latest.photo_path,original.photo_path) and not exists(select 1 from storage.objects where bucket_id='community-photos' and name=p_photo and owner_id=auth.uid()::text and split_part(name,'/',1)=auth.uid()::text) then raise exception 'Upload your own replacement screenshot';end if;
 insert into public.ruby_card_revisions(id,user_id,brand,theme,submission_day,sport,title,legs,note,photo_path,sportsbook,reported_odds,submission_id,revision,edited_by,source_link)
 values(rid,original.user_id,original.brand,original.theme,original.submission_day,p_sport,coalesce(nullif(btrim(p_title),''),original.brand||'’s daily lay'),p_legs,coalesce(btrim(p_note),''),p_photo,nullif(btrim(p_book),''),p_odds,p_submission,n+1,auth.uid(),case when latest.id is null then original.source_link else latest.source_link end);
 return rid;
end $function$
;

revoke all on function public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.edit_ruby_link(p_submission uuid, p_expected integer, p_title text, p_legs jsonb, p_note text, p_sport text, p_book text, p_odds integer, p_photo text, p_source_link text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.edit_ruby_link(p_submission,p_expected,p_title,p_legs,p_note,p_sport,p_book,p_odds,p_photo,p_source_link)$function$
;

revoke all on function public.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.feature_ruby(p_submission uuid, p_odds integer, p_book text, p_source text, p_observed timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.feature_ruby(p_submission,p_odds,p_book,p_source,p_observed)$function$
;

revoke all on function public.feature_ruby(uuid,integer,text,text,timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.is_admin(); $function$
;

revoke all on function public.is_admin() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.leg_tail_counts(p_legs text[])
 RETURNS TABLE(leg_key text, tail_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select * from private.leg_tail_counts(p_legs);
$function$
;

revoke all on function public.leg_tail_counts(text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nba_name_key(n text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
 select nullif(trim(regexp_replace(regexp_replace(regexp_replace(
  lower(translate(n, 'áàâäãåāÁÀÂÄÃÅĀčćçČĆÇďĎéèêëěēÉÈÊËĚĒíìîïīÍÌÎÏĪľłĽŁñńňÑŃŇóòôöõøōÓÒÔÖÕØŌřŘšśşŠŚŞťŤúùûüůūÚÙÛÜŮŪýÿÝŸžźżŽŹŻ',
   'aaaaaaaaaaaaaaccccccddeeeeeeeeeeeeiiiiiiiiiillllnnnnnnoooooooooooooorrssssssttuuuuuuuuuuuuyyyyzzzzzz')),
  '[^a-z ]', '', 'g'), '\m(jr|sr|ii|iii|iv)\M', '', 'g'), '\s+', ' ', 'g')), '')
$function$
;

revoke all on function public.nba_name_key(text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.nba_player_usage(p_athletes text[])
 RETURNS TABLE(game_id uuid, athlete_id text, usage numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with lines as (
  select r.game_id, r.athlete_id, r.team, r.minutes, r.turnovers, s.fga, s.fta
  from public.nba_player_results r join public.nba_player_shooting s using (game_id, athlete_id)
  where r.played and r.game_id in (select x.game_id from public.nba_player_results x where x.athlete_id = any(p_athletes))),
 teams as (
  select game_id, team, sum(coalesce(minutes,0)) mp, sum(fga + 0.44 * fta + turnovers) poss from lines group by game_id, team)
 select l.game_id, l.athlete_id,
  round(100 * (l.fga + 0.44 * l.fta + l.turnovers) * (t.mp / 5.0) / (l.minutes * t.poss), 1)
 from lines l join teams t using (game_id, team)
 where l.athlete_id = any(p_athletes) and l.minutes > 0 and t.poss > 0 and t.mp > 0
  and not exists (select 1 from public.nba_player_results m where m.game_id = l.game_id and m.team = l.team
   and not exists (select 1 from public.nba_player_shooting z where z.game_id = m.game_id and z.athlete_id = m.athlete_id))
$function$
;

revoke all on function public.nba_player_usage(text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_action(p_action text, p_id uuid DEFAULT NULL::uuid, p_before timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if p_action='read_all' then update public.notifications set read_at=now(),viewed_at=now() where recipient_id=auth.uid() and read_at is null and updated_at<=p_before;
 elsif p_action='read' then update public.notifications set read_at=now(),viewed_at=now() where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 elsif p_action='unread' then update public.notifications set read_at=null where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 elsif p_action='view' then update public.notifications set viewed_at=now() where id=p_id and recipient_id=auth.uid() and viewed_at is null and updated_at<=p_before;
 elsif p_action='delete' then delete from public.notifications where id=p_id and recipient_id=auth.uid() and updated_at<=p_before;
 else raise exception 'Invalid notification action';end if;
end$function$
;

revoke all on function public.notification_action(text,uuid,timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('unread',count(*) filter(where read_at is null),'unviewed',count(*) filter(where viewed_at is null),'messages',count(*) filter(where read_at is null and type in ('message','group_message','message_request','message_reminder'))) from public.notifications where recipient_id=auth.uid();
$function$
;

revoke all on function public.notification_counts() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_inbox(p_type text DEFAULT NULL::text, p_search text DEFAULT ''::text, p_unread boolean DEFAULT false, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc,id desc),'[]'::jsonb),'snapshot_at',now()) from (
 select * from public.notifications where recipient_id=auth.uid()
 and (not p_unread or read_at is null)
 and (p_type is null or type=p_type or (p_type='messages' and type in ('message','group_message','message_request','message_reminder')) or (p_type='system' and type in ('welcome','profile_reminder','security','password_change','account','feature','suggestion')))
 and (left(trim(p_search),100)='' or to_tsvector('simple',private.notification_search_document(actor_name,actor_names,message))@@plainto_tsquery('simple',left(p_search,100)))
 and (p_before is null or (updated_at,id)<(p_before,coalesce(p_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by updated_at desc,id desc limit 40
 )x;
$function$
;

revoke all on function public.notification_inbox(text,text,boolean,timestamp with time zone,uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_pulse(p_device uuid, p_visible boolean DEFAULT true)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.notification_pulse(p_device,p_visible)$function$
;

revoke all on function public.notification_pulse(uuid,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.notification_view(p_ids uuid[], p_before timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$begin
 if cardinality(p_ids)>40 then raise exception 'View up to forty notifications';end if;
 update public.notifications set viewed_at=now() where recipient_id=auth.uid() and id=any(p_ids) and viewed_at is null and updated_at<=p_before;
end$function$
;

revoke all on function public.notification_view(uuid[],timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.published_leg_catalog(p_since timestamp with time zone DEFAULT (now() - '7 days'::interval))
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc,x.leg_key),'[]'::jsonb) from (
  select l.*,private.published_leg_recommendation(l.leg_key) as recommendation
  from public.published_legs l join public.games g on g.id=l.game_id
  where lower(g.sport)='nfl' and (l.market ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)' or (l.market='Player Prop' and l.name ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)')) and l.published_at>=greatest(p_since,now()-interval '14 days')
  order by l.published_at desc,l.leg_key
 )x
$function$
;

revoke all on function public.published_leg_catalog(timestamp with time zone) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.restrict_community_member(p_user uuid, p_reason text, p_restricted boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Admin required';end if;
 if p_user=auth.uid() then raise exception 'Cannot restrict your own admin account';end if;
 if p_restricted then insert into private.community_restrictions(user_id,reason) values(p_user,p_reason) on conflict(user_id) do update set reason=excluded.reason,created_at=now();
 else delete from private.community_restrictions where user_id=p_user;end if;
end $function$
;

revoke all on function public.restrict_community_member(uuid,text,boolean) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ruby_card_comment_counts(p_cards uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null; end if;
 if p_cards is null or cardinality(p_cards) > 50 then raise exception 'Too many cards'; end if;
 return coalesce((select jsonb_object_agg(k.id, (select count(*) from public.ruby_card_comments c where c.card_id=k.id
    and (coalesce(private.community_member_allowed(c.user_id),false) or coalesce(public.is_admin(),false))))
  from (select distinct unnest(p_cards) id) k where private.ruby_card_open(k.id)), '{}'::jsonb);
end $function$
;

revoke all on function public.ruby_card_comment_counts(uuid[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ruby_card_comments(p_card uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null or not coalesce(private.age_member_allowed(),false) then return null; end if;
 if not private.ruby_card_open(p_card) then return null; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'card_id',x.card_id,'user_id',x.user_id,
   'parent_id',x.parent_id,'author_name',x.author_name,'body',x.body,'created_at',x.created_at) order by x.created_at desc)
  from (select * from public.ruby_card_comments c where c.card_id=p_card
   and (coalesce(private.community_member_allowed(c.user_id),false) or coalesce(public.is_admin(),false))
   order by c.created_at desc limit 50) x), '[]'::jsonb);
end $function$
;

revoke all on function public.ruby_card_comments(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ruby_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.ruby_home()$function$
;

revoke all on function public.ruby_home() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_community_poll_vote(p_post uuid, p_option integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.set_community_poll_vote(p_post, p_option) $function$
;

revoke all on function public.set_community_poll_vote(uuid,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_community_post_vote(p_post uuid, p_value integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.set_community_post_vote(p_post, p_value) $function$
;

revoke all on function public.set_community_post_vote(uuid,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.set_community_reaction(p_post uuid, p_reaction text DEFAULT 'heart'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.set_community_reaction(p_post,p_reaction)$function$
;

revoke all on function public.set_community_reaction(uuid,text) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.share_member_parlay(p_parlay uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare ticket public.member_parlays; lines jsonb:='[]'; leg jsonb; target text[]; name text; line text; post uuid;
begin
 if auth.uid() is null or not private.has_membership() or not private.community_photo_access() then raise exception 'Complete your visible community profile before sharing';end if;
 select * into ticket from public.member_parlays where id=p_parlay and user_id=auth.uid() for update;
 if not found then raise exception 'Parlay unavailable';end if;
 if ticket.community_post_id is not null then return ticket.community_post_id;end if;
 for leg in select * from jsonb_array_elements(ticket.legs) loop
  target:=regexp_match(leg->>'market','((over\s+|under\s+)?[0-9]+(\.[0-9]+)?\+?\s+((receiving|rushing|passing)\s+(yards|yds)|receptions|catches))','i');
  name:=trim(leg->>'name');
  if target is not null then line:=name||' '||target[1];
  elsif leg->>'market'='Player Prop' then line:=name;
  else raise exception 'Unsupported parlay leg';end if;
  if line is null or length(line) not between 1 and 180 then raise exception 'Invalid parlay leg';end if;
  lines:=lines||jsonb_build_array(line);
 end loop;
 insert into public.community_posts(user_id,sport,kind,title,body,legs)
 values(auth.uid(),'nfl','slip',ticket.title,'My custom parlay · Member-created combination, not a Vegas Quant recommendation.',lines) returning id into post;
 update public.member_parlays set community_post_id=post where id=ticket.id;
 return post;
end $function$
;

revoke all on function public.share_member_parlay(uuid) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_ruby(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text DEFAULT ''::text, p_photo text DEFAULT NULL::text, p_book text DEFAULT NULL::text, p_odds integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.submit_ruby(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds)$function$
;

revoke all on function public.submit_ruby(uuid,text,text,jsonb,text,text,text,integer) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.submit_ruby_link(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text, p_photo text, p_book text, p_odds integer, p_source_link text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.submit_ruby_link(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds,p_source_link)$function$
;

revoke all on function public.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) from public,anon,authenticated,service_role;

create view public.personal_entry_state with (security_invoker=true) as
 WITH effective AS (
         SELECT e.id,
            e.user_id,
            e.personal_challenge_id,
            e.pick_id,
            e.created_at,
                CASE
                    WHEN d.id IS NULL THEN e.line
                    ELSE (d.snapshot ->> 'line'::text)::numeric
                END AS line,
            COALESCE((d.snapshot ->> 'odds'::text)::numeric, e.odds) AS odds,
            COALESCE((d.snapshot ->> 'stake_cents'::text)::integer, e.stake_cents) AS stake_cents,
            COALESCE((d.snapshot ->> 'payout_cents'::text)::integer, e.payout_cents) AS payout_cents,
            COALESCE(d.snapshot ->> 'book'::text, e.book) AS book,
            COALESCE((d.snapshot ->> 'placed_at'::text)::timestamp with time zone, e.placed_at) AS placed_at,
            COALESCE(d.result_override, s.result) AS result,
            d.id AS correction_id,
            d.created_at AS corrected_at,
            to_jsonb(e.*) AS original
           FROM personal_entries e
             LEFT JOIN LATERAL ( SELECT d_1.id,
                    d_1.sequence,
                    d_1.request_id,
                    d_1.entry_id,
                    d_1.user_id,
                    d_1.admin_id,
                    d_1.approved,
                    d_1.snapshot,
                    d_1.result_override,
                    d_1.note,
                    d_1.created_at
                   FROM personal_correction_decisions d_1
                  WHERE d_1.entry_id = e.id AND d_1.approved
                  ORDER BY d_1.sequence DESC
                 LIMIT 1) d ON true
             LEFT JOIN personal_settlements s ON s.entry_id = e.id
        )
 SELECT id,
    user_id,
    personal_challenge_id,
    pick_id,
    created_at,
    line,
    odds,
    stake_cents,
    payout_cents,
    book,
    placed_at,
    result,
    correction_id,
    corrected_at,
    original,
        CASE result
            WHEN 'WIN'::text THEN payout_cents - stake_cents
            WHEN 'LOSS'::text THEN - stake_cents
            WHEN 'PUSH'::text THEN 0
            WHEN 'VOID'::text THEN 0
            ELSE NULL::integer
        END AS profit_cents
   FROM effective;
revoke all on public.personal_entry_state from public,anon,authenticated,service_role;
grant select on public.personal_entry_state to authenticated,service_role;

create view public.published_legs with (security_invoker=true) as
 SELECT (('candidate:'::text || r.id::text) || ':'::text) || c.ordinality::text AS leg_key,
    r.id AS release_id,
    c.ordinality::integer AS leg_index,
    NULL::uuid AS official_pick_id,
        CASE
            WHEN (c.value ->> 'game_id'::text) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'::text THEN (c.value ->> 'game_id'::text)::uuid
            ELSE s.game_id
        END AS game_id,
        CASE
            WHEN (c.value ->> 'research'::text) = 'true'::text THEN 'RESEARCH'::text
            WHEN (c.value ->> 'parlay'::text) = 'true'::text THEN 'PARLAY'::text
            WHEN (c.value ->> 'fun_play'::text) = 'true'::text THEN 'HAIL_MARY'::text
            WHEN (c.value ->> 'pick_of_day'::text) = 'true'::text THEN 'PICK_OF_DAY'::text
            ELSE 'SINGLE'::text
        END AS kind,
    c.value ->> 'name'::text AS name,
    c.value ->> 'market'::text AS market,
    c.value ->> 'matchup'::text AS matchup,
    c.value ->> 'quote'::text AS quote,
    c.value ->> 'quote_observed_at'::text AS quote_observed_at,
    c.value ->> 'gambly_url'::text AS gambly_url,
    c.value ->> 'copy_text'::text AS copy_text,
    c.value ->> 'why'::text AS why,
    c.value ->> 'risk'::text AS risk,
    r.created_at AS published_at,
    r.expires_at,
    rr.result,
    rr.source_url AS result_source,
        CASE
            WHEN (c.value ->> 'odds'::text) ~ '^[+-]?[0-9]{3,5}(\.0+)?$'::text THEN
            CASE
                WHEN abs((c.value ->> 'odds'::text)::numeric) >= 100::numeric THEN (c.value ->> 'odds'::text)::numeric
                ELSE NULL::numeric
            END
            ELSE NULL::numeric
        END AS odds,
    NULLIF(c.value ->> 'original_leg_key'::text, ''::text) AS original_leg_key
   FROM candidate_releases r
     CROSS JOIN LATERAL jsonb_array_elements(r.candidates) WITH ORDINALITY c(value, ordinality)
     LEFT JOIN challenge_stages s ON s.id = r.stage_id
     LEFT JOIN research_leg_results rr ON rr.leg_key = ((('candidate:'::text || r.id::text) || ':'::text) || c.ordinality::text)
UNION ALL
 SELECT 'official:'::text || p.id::text AS leg_key,
    NULL::uuid AS release_id,
    NULL::integer AS leg_index,
    p.id AS official_pick_id,
    p.game_id,
    'OFFICIAL'::text AS kind,
    p.selection AS name,
    p.market,
    (g.away_team || ' @ '::text) || g.home_team AS matchup,
    ((p.book || ' '::text) ||
        CASE
            WHEN p.odds > 0::numeric THEN '+'::text
            ELSE ''::text
        END) || p.odds::text AS quote,
    p.known_at_publication ->> 'quote_observed_at'::text AS quote_observed_at,
    p.gambly_url,
    NULL::text AS copy_text,
    p.why_like AS why,
    p.why_lose AS risk,
    p.created_at AS published_at,
    g.kickoff AS expires_at,
    pr.result,
    pr.source AS result_source,
    p.odds,
    NULL::text AS original_leg_key
   FROM official_picks p
     JOIN games g ON g.id = p.game_id
     LEFT JOIN pick_results pr ON pr.pick_id = p.id;
revoke all on public.published_legs from public,anon,authenticated,service_role;
grant select on public.published_legs to authenticated,service_role;

create view public.ruby_cards with (security_invoker=true) as
 SELECT c.id,
    c.user_id,
    c.brand,
    c.theme,
    c.submission_day,
    c.sport,
    c.title,
    c.legs,
    c.note,
    c.photo_path,
    c.sportsbook,
    c.reported_odds,
    c.created_at,
    c.revision,
    c.edited_at,
    c.hidden,
    c.reported_result,
        CASE
            WHEN r.id IS NULL THEN s.source_link
            ELSE r.source_link
        END AS source_link
   FROM ( SELECT s_1.id,
            s_1.user_id,
            s_1.brand,
            s_1.theme,
            s_1.submission_day,
            COALESCE(r_1.sport, s_1.sport) AS sport,
            COALESCE(r_1.title, s_1.title) AS title,
            COALESCE(r_1.legs, s_1.legs) AS legs,
            COALESCE(r_1.note, s_1.note) AS note,
                CASE
                    WHEN r_1.id IS NULL THEN s_1.photo_path
                    ELSE r_1.photo_path
                END AS photo_path,
                CASE
                    WHEN r_1.id IS NULL THEN s_1.sportsbook
                    ELSE r_1.sportsbook
                END AS sportsbook,
                CASE
                    WHEN r_1.id IS NULL THEN s_1.reported_odds
                    ELSE r_1.reported_odds
                END AS reported_odds,
            s_1.created_at,
            COALESCE(r_1.revision, 0) AS revision,
            r_1.created_at AS edited_at,
            COALESCE(v.hidden, false) AS hidden,
                CASE
                    WHEN rr.revision = COALESCE(r_1.revision, 0) THEN rr.outcome
                    ELSE NULL::text
                END AS reported_result
           FROM ruby_submissions s_1
             LEFT JOIN LATERAL ( SELECT ruby_card_revisions.id,
                    ruby_card_revisions.user_id,
                    ruby_card_revisions.brand,
                    ruby_card_revisions.theme,
                    ruby_card_revisions.submission_day,
                    ruby_card_revisions.sport,
                    ruby_card_revisions.title,
                    ruby_card_revisions.legs,
                    ruby_card_revisions.note,
                    ruby_card_revisions.photo_path,
                    ruby_card_revisions.sportsbook,
                    ruby_card_revisions.reported_odds,
                    ruby_card_revisions.created_at,
                    ruby_card_revisions.submission_id,
                    ruby_card_revisions.revision,
                    ruby_card_revisions.edited_by
                   FROM ruby_card_revisions
                  WHERE ruby_card_revisions.submission_id = s_1.id
                  ORDER BY ruby_card_revisions.revision DESC
                 LIMIT 1) r_1 ON true
             LEFT JOIN LATERAL ( SELECT ruby_visibility_events.id,
                    ruby_visibility_events.submission_id,
                    ruby_visibility_events.hidden,
                    ruby_visibility_events.changed_by,
                    ruby_visibility_events.created_at
                   FROM ruby_visibility_events
                  WHERE ruby_visibility_events.submission_id = s_1.id
                  ORDER BY ruby_visibility_events.created_at DESC, ruby_visibility_events.id DESC
                 LIMIT 1) v ON true
             LEFT JOIN LATERAL ( SELECT ruby_result_reports.id,
                    ruby_result_reports.submission_id,
                    ruby_result_reports.revision,
                    ruby_result_reports.outcome,
                    ruby_result_reports.reported_by,
                    ruby_result_reports.reported_at
                   FROM ruby_result_reports
                  WHERE ruby_result_reports.submission_id = s_1.id
                  ORDER BY ruby_result_reports.reported_at DESC, ruby_result_reports.id DESC
                 LIMIT 1) rr ON true
          WHERE NOT COALESCE(v.hidden, false) OR ( SELECT is_admin() AS is_admin)) c
     JOIN ruby_submissions s ON s.id = c.id
     LEFT JOIN LATERAL ( SELECT ruby_card_revisions.id,
            ruby_card_revisions.source_link
           FROM ruby_card_revisions
          WHERE ruby_card_revisions.submission_id = s.id
          ORDER BY ruby_card_revisions.revision DESC
         LIMIT 1) r ON true;
revoke all on public.ruby_cards from public,anon,authenticated,service_role;
grant select on public.ruby_cards to authenticated,service_role;

set local check_function_bodies=true;

CREATE OR REPLACE FUNCTION private.before_age_is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(auth.jwt()->>'aal','aal1')='aal2' and exists(select 1 from private.admin_users where user_id=(select auth.uid()));
$function$
;

CREATE OR REPLACE FUNCTION private.community_follow_target_allowed(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (
  select 1 from public.community_profiles cp join auth.users u on u.id = cp.user_id
  where cp.user_id = target and cp.visible
   and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
        )
 ) and coalesce(private.community_member_allowed(target), false)
$function$
;

CREATE OR REPLACE FUNCTION private.community_member_allowed(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and not exists(select 1 from public.member_blocks b where (b.user_id=auth.uid() and b.target_user_id=target) or (b.target_user_id=auth.uid() and b.user_id=target))
$function$
;

CREATE OR REPLACE FUNCTION private.community_photo_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and private.age_member_allowed()
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
 and exists(select 1 from public.community_profiles p where p.user_id=auth.uid() and p.visible and p.avatar is not null and p.username !~* '^Member_[a-f0-9]{8}$')
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$function$
;

CREATE OR REPLACE FUNCTION private.community_reaction_actor_allowed()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select auth.uid() is not null and coalesce(private.age_member_allowed(),false)
 and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null
  and (banned_until is null or banned_until<=now()))
 and not exists(select 1 from private.community_restrictions where user_id=auth.uid())
 and not exists(select 1 from private.account_erasure_jobs where user_id=auth.uid() and expires_at>now())
$function$
;

CREATE OR REPLACE FUNCTION private.is_research_release(c jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_typeof(c)='array' and jsonb_array_length(c)>0 and not exists(
  select 1 from jsonb_array_elements(c) x
  where jsonb_typeof(x)<>'object' or x->>'research' is distinct from 'true'
   or x->>'analysis_kind' is distinct from 'RESEARCH_BOARD'
   or coalesce(x->>'parlay','false')<>'false' or coalesce(x->>'pick_of_day','false')<>'false'
   or coalesce(x->>'fun_play','false')<>'false' or x ? 'legs' or x ? 'parlay_group'
   or x ? 'supersedes_release_id' or x ? 'selection_gate');
$function$
;

CREATE OR REPLACE FUNCTION private.is_weekly_sleeper(c jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select jsonb_typeof(c)='array' and c#>>'{0,analysis_kind}'='ENTERTAINMENT_SLEEPER_PARLAY'
 and c#>>'{0,worth_a_dollar}'='true' and c#>>'{0,parlay}'='true'
$function$
;

CREATE OR REPLACE FUNCTION private.notification_actor_followed(p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_actor is null or p_type in ('security','password_change','account')
 
 or exists(select 1 from public.member_follows f where f.user_id=p_recipient and f.target_user_id=p_actor)
$function$
;

CREATE OR REPLACE FUNCTION private.notification_follow_inbox_allowed(p_id uuid, p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select p_recipient=auth.uid() and private.notification_group_followed(p_id,p_recipient,p_actor,p_type)
$function$
;

CREATE OR REPLACE FUNCTION private.notification_group_followed(p_id uuid, p_recipient uuid, p_actor uuid, p_type text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select private.notification_actor_followed(p_recipient,p_actor,p_type)
 and not exists(select 1 from private.notification_events e where e.notification_id=p_id
  and not private.notification_actor_followed(p_recipient,e.actor_id,e.type))
$function$
;

CREATE OR REPLACE FUNCTION private.notification_search_document(p_actor text, p_names text[], p_message text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$select p_actor||' '||coalesce(array_to_string(p_names,' '),'')||' '||p_message$function$
;

CREATE OR REPLACE FUNCTION private.public_overview()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object('challenges',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'number',c.number,'status',c.status,'current_stage',c.current_stage,'balance_cents',c.balance_cents,'wins',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='WIN'),'losses',(select count(*) from public.pick_results r join public.official_picks p on p.id=r.pick_id join public.challenge_stages s on s.id=p.stage_id where s.challenge_id=c.id and r.result='LOSS')) order by c.number desc),'[]') from public.challenges c),'stages',(select coalesce(jsonb_agg(jsonb_build_object('stage_number',stage_number,'challenge_id',challenge_id,'game_id',game_id,'status',status) order by stage_number),'[]') from public.challenge_stages));
$function$
;

CREATE OR REPLACE FUNCTION private.recent_ruby_card_comment()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (select 1 from public.ruby_card_comments where user_id=auth.uid() and created_at>now()-interval '10 seconds')
$function$
;

CREATE OR REPLACE FUNCTION private.ruby_card_open(p_card uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists (select 1 from public.ruby_submissions s where s.id=p_card and coalesce(private.ruby_visible(s.user_id),false))
  and exists (select 1 from public.ruby_cards c where c.id=p_card and not c.hidden)
$function$
;

CREATE OR REPLACE FUNCTION private.ruby_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select case when private.age_member_allowed() then jsonb_build_object('user_id',auth.uid(),'day',(now() at time zone 'America/New_York')::date,'contributor',(select to_jsonb(c) from public.ruby_contributors c where c.user_id=auth.uid() and c.active),'submitted',(select id from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date order by created_at desc limit 1),'submission_count',(select count(*) from public.ruby_submissions where user_id=auth.uid() and submission_day=(now() at time zone 'America/New_York')::date),'admin',public.is_admin(),'due',(select coalesce(jsonb_agg(x order by x.created_at),'[]') from (select s.id,s.brand,coalesce(r.title,s.title) title,s.created_at,coalesce(r.revision,0) revision,coalesce(r.legs,s.legs) legs,case when r.id is null then s.photo_path else r.photo_path end photo_path,case when r.id is null then s.source_link else r.source_link end source_link from public.ruby_submissions s left join lateral(select * from public.ruby_card_revisions where submission_id=s.id order by revision desc limit 1) r on true left join lateral(select * from public.ruby_result_reports where submission_id=s.id order by reported_at desc,id desc limit 1) rr on true where s.user_id=auth.uid() and s.submission_day<(now() at time zone 'America/New_York')::date and (rr.id is null or rr.revision<>coalesce(r.revision,0) or (rr.outcome='PENDING' and (rr.reported_at at time zone 'America/New_York')::date<(now() at time zone 'America/New_York')::date))) x)) else '{}'::jsonb end$function$
;

CREATE OR REPLACE FUNCTION private.ruby_visible(p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$select private.age_member_allowed() and private.community_member_allowed(p_user) and not exists(select 1 from private.community_restrictions where user_id=p_user)$function$
;

CREATE OR REPLACE FUNCTION private.signup_trial_expires_at()
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select created_at + interval '14 days' from auth.users where id=auth.uid() and not coalesce(is_anonymous,false);
$function$
;

CREATE OR REPLACE FUNCTION private.zone_editorial_leg(p_id uuid, p_user uuid, p_sport text, p_title text, p_body text, p_at timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when length(split_part(p_body,E'\n\n',1)) between 1 and 180 then split_part(p_body,E'\n\n',1) else p_title end
 where (p_sport='nba' and exists(select 1 from public.nba_editorial_picks n
  where md5('nba-editorial-zone:'||n.publication_key)::uuid=p_id and n.published_at=p_at
   and position(n.rationale in p_body)>0 and position(n.risk in p_body)>0 and position(n.unknowns in p_body)>0))
 or (p_sport in ('nhl','ncaab') and (select count(*) from public.sports_selections s join public.sports_games g on g.id=s.game_id
  where s.author_id=p_user and g.sport=p_sport and s.title=p_title and s.published_at=p_at
   and p_body=split_part(p_body,E'\n\n',1)||E'\n\n'||trim(s.why)||E'\n\nRisk: '||trim(s.risk)||
    E'\n\nVegas Quant editorial read, not a guaranteed result. Prices move; check the current line.')=1)
$function$
;

CREATE OR REPLACE FUNCTION private.zone_like(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_')$function$
;

CREATE OR REPLACE FUNCTION private.zone_rx(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$select regexp_replace(trim(p), '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g')$function$
;

CREATE OR REPLACE FUNCTION private.zone_side_rx(p_sport text, p_name text, p_short text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
 select string_agg(distinct private.zone_rx(n), '|') from unnest(array[
  p_name, p_short,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then regexp_replace(p_name, '^\S+\s+', '') end,
  case when p_sport in ('nfl','nba','nhl') and p_name ~ ' ' then substring(p_name from '\S+$') end
 ]) n where n is not null and length(trim(n)) >= 3
$function$
;

CREATE OR REPLACE FUNCTION public.community_activity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.community_activity() $function$
;

CREATE OR REPLACE FUNCTION public.community_comments(p_post uuid, p_target uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
 select c.*,(select count(*) from public.community_comment_reactions r where r.comment_id=c.id) as reactions,
 exists(select 1 from public.community_comment_reactions r where r.comment_id=c.id and r.user_id=auth.uid()) as reacted
 from public.community_post_comments c where c.post_id=p_post and (c.id in(select id from public.community_post_comments where post_id=p_post order by created_at desc limit 50) or c.id=p_target)
 ) x;
$function$
;

CREATE OR REPLACE FUNCTION public.community_feed(p_sport text DEFAULT 'nfl'::text, p_limit integer DEFAULT 20, p_following boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.*,(select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
 exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
 (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
 exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
 from public.community_posts p where (p_sport='all' or p.sport=p_sport) and (not p_following or exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id))
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,100))
 )x
$function$
;

CREATE OR REPLACE FUNCTION public.community_post(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select to_jsonb(x) from (
  select p.*,
   (select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
   exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
   (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
   exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
  from public.community_posts p where p.id=p_id and private.community_member_allowed(p.user_id)
 ) x
$function$
;

CREATE OR REPLACE FUNCTION public.community_story_clock()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select case when auth.uid() is not null then
  jsonb_build_object('version', 1, 'server_now', statement_timestamp())
 else null end
$function$
;

CREATE OR REPLACE FUNCTION public.create_member_parlay(p_title text, p_leg_keys text[])
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.create_member_parlay(p_title,p_leg_keys)$function$
;

CREATE OR REPLACE FUNCTION public.desk_data()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select case when private.has_membership() then jsonb_build_object(
 'access',public.membership_status(), 'overview',private.public_overview(),
 'games',(select coalesce(jsonb_agg(t order by kickoff),'[]') from public.games t),
 'challenges',(select coalesce(jsonb_agg(t order by number desc),'[]') from public.challenges t),
 'stages',(select coalesce(jsonb_agg(t order by stage_number),'[]') from public.challenge_stages t),
 'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from public.market_snapshots t),
 'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from public.analysis_versions t),
 'picks',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.official_picks t),
 'entries',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_entries t),
 'closings',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.closing_lines t),
 'results',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_results t),
 'reviews',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.process_reviews t),
 'transactions',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.bankroll_transactions t),
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t)) else private.free_challenge_desk() end; $function$
;

CREATE OR REPLACE FUNCTION public.desk_data_compact()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select case when private.has_membership() then jsonb_build_object(
 'access',public.membership_status(), 'overview',private.public_overview(),
 'games',(select coalesce(jsonb_agg(t order by kickoff),'[]') from public.games t),
 'challenges',(select coalesce(jsonb_agg(t order by number desc),'[]') from public.challenges t),
 'stages',(select coalesce(jsonb_agg(t order by stage_number),'[]') from public.challenge_stages t),
 'markets',(select coalesce(jsonb_agg(t order by observed_at desc,created_at desc),'[]') from (select * from public.market_snapshots order by observed_at desc,created_at desc,id desc limit 200) t),
 'analyses',(select coalesce(jsonb_agg(t order by created_at desc,version desc),'[]') from (select distinct on (game_id) * from public.analysis_versions order by game_id,created_at desc,version desc) t),
 'picks',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.official_picks t),
 'entries',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_entries t),
 'closings',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.closing_lines t),
 'results',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.pick_results t),
 'reviews',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.process_reviews t),
 'transactions',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.bankroll_transactions t),
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from (select * from public.audit_events where false) t)) else private.free_challenge_desk() end; $function$
;

CREATE OR REPLACE FUNCTION public.edit_ruby_link(p_submission uuid, p_expected integer, p_title text, p_legs jsonb, p_note text, p_sport text, p_book text, p_odds integer, p_photo text, p_source_link text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.edit_ruby_link(p_submission,p_expected,p_title,p_legs,p_note,p_sport,p_book,p_odds,p_photo,p_source_link)$function$
;

CREATE OR REPLACE FUNCTION public.feature_ruby(p_submission uuid, p_odds integer, p_book text, p_source text, p_observed timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.feature_ruby(p_submission,p_odds,p_book,p_source,p_observed)$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select private.is_admin(); $function$
;

CREATE OR REPLACE FUNCTION public.leg_tail_counts(p_legs text[])
 RETURNS TABLE(leg_key text, tail_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select * from private.leg_tail_counts(p_legs);
$function$
;

CREATE OR REPLACE FUNCTION public.nba_name_key(n text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
 select nullif(trim(regexp_replace(regexp_replace(regexp_replace(
  lower(translate(n, 'áàâäãåāÁÀÂÄÃÅĀčćçČĆÇďĎéèêëěēÉÈÊËĚĒíìîïīÍÌÎÏĪľłĽŁñńňÑŃŇóòôöõøōÓÒÔÖÕØŌřŘšśşŠŚŞťŤúùûüůūÚÙÛÜŮŪýÿÝŸžźżŽŹŻ',
   'aaaaaaaaaaaaaaccccccddeeeeeeeeeeeeiiiiiiiiiillllnnnnnnoooooooooooooorrssssssttuuuuuuuuuuuuyyyyzzzzzz')),
  '[^a-z ]', '', 'g'), '\m(jr|sr|ii|iii|iv)\M', '', 'g'), '\s+', ' ', 'g')), '')
$function$
;

CREATE OR REPLACE FUNCTION public.nba_player_usage(p_athletes text[])
 RETURNS TABLE(game_id uuid, athlete_id text, usage numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 with lines as (
  select r.game_id, r.athlete_id, r.team, r.minutes, r.turnovers, s.fga, s.fta
  from public.nba_player_results r join public.nba_player_shooting s using (game_id, athlete_id)
  where r.played and r.game_id in (select x.game_id from public.nba_player_results x where x.athlete_id = any(p_athletes))),
 teams as (
  select game_id, team, sum(coalesce(minutes,0)) mp, sum(fga + 0.44 * fta + turnovers) poss from lines group by game_id, team)
 select l.game_id, l.athlete_id,
  round(100 * (l.fga + 0.44 * l.fta + l.turnovers) * (t.mp / 5.0) / (l.minutes * t.poss), 1)
 from lines l join teams t using (game_id, team)
 where l.athlete_id = any(p_athletes) and l.minutes > 0 and t.poss > 0 and t.mp > 0
  and not exists (select 1 from public.nba_player_results m where m.game_id = l.game_id and m.team = l.team
   and not exists (select 1 from public.nba_player_shooting z where z.game_id = m.game_id and z.athlete_id = m.athlete_id))
$function$
;

CREATE OR REPLACE FUNCTION public.notification_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('unread',count(*) filter(where read_at is null),'unviewed',count(*) filter(where viewed_at is null),'messages',count(*) filter(where read_at is null and type in ('message','group_message','message_request','message_reminder'))) from public.notifications where recipient_id=auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.notification_inbox(p_type text DEFAULT NULL::text, p_search text DEFAULT ''::text, p_unread boolean DEFAULT false, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) order by updated_at desc,id desc),'[]'::jsonb),'snapshot_at',now()) from (
 select * from public.notifications where recipient_id=auth.uid()
 and (not p_unread or read_at is null)
 and (p_type is null or type=p_type or (p_type='messages' and type in ('message','group_message','message_request','message_reminder')) or (p_type='system' and type in ('welcome','profile_reminder','security','password_change','account','feature','suggestion')))
 and (left(trim(p_search),100)='' or to_tsvector('simple',private.notification_search_document(actor_name,actor_names,message))@@plainto_tsquery('simple',left(p_search,100)))
 and (p_before is null or (updated_at,id)<(p_before,coalesce(p_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))) order by updated_at desc,id desc limit 40
 )x;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_pulse(p_device uuid, p_visible boolean DEFAULT true)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.notification_pulse(p_device,p_visible)$function$
;

CREATE OR REPLACE FUNCTION public.published_leg_catalog(p_since timestamp with time zone DEFAULT (now() - '7 days'::interval))
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc,x.leg_key),'[]'::jsonb) from (
  select l.*,private.published_leg_recommendation(l.leg_key) as recommendation
  from public.published_legs l join public.games g on g.id=l.game_id
  where lower(g.sport)='nfl' and (l.market ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)' or (l.market='Player Prop' and l.name ~* '[0-9].*((receiving|rushing|passing).*(yards|yds)|receptions|catches)')) and l.published_at>=greatest(p_since,now()-interval '14 days')
  order by l.published_at desc,l.leg_key
 )x
$function$
;

CREATE OR REPLACE FUNCTION public.ruby_home()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$select private.ruby_home()$function$
;

CREATE OR REPLACE FUNCTION public.set_community_poll_vote(p_post uuid, p_option integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.set_community_poll_vote(p_post, p_option) $function$
;

CREATE OR REPLACE FUNCTION public.set_community_post_vote(p_post uuid, p_value integer)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.set_community_post_vote(p_post, p_value) $function$
;

CREATE OR REPLACE FUNCTION public.set_community_reaction(p_post uuid, p_reaction text DEFAULT 'heart'::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.set_community_reaction(p_post,p_reaction)$function$
;

CREATE OR REPLACE FUNCTION public.submit_ruby(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text DEFAULT ''::text, p_photo text DEFAULT NULL::text, p_book text DEFAULT NULL::text, p_odds integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.submit_ruby(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds)$function$
;

CREATE OR REPLACE FUNCTION public.submit_ruby_link(p_id uuid, p_sport text, p_title text, p_legs jsonb, p_note text, p_photo text, p_book text, p_odds integer, p_source_link text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$select private.submit_ruby_link(p_id,p_sport,p_title,p_legs,p_note,p_photo,p_book,p_odds,p_source_link)$function$
;

alter table public.alert_preferences add constraint "alert_preferences_pkey" PRIMARY KEY (user_id);

alter table public.alert_preferences add constraint "alert_preferences_scope_check" CHECK ((scope = ANY (ARRAY['all'::text, 'followed'::text])));

alter table public.app_update_reads add constraint "app_update_reads_pkey" PRIMARY KEY (user_id, update_id);

alter table public.app_updates add constraint "app_updates_pkey" PRIMARY KEY (id);

alter table public.audit_events add constraint "audit_events_pkey" PRIMARY KEY (id);

alter table public.bankroll_transactions add constraint "bankroll_transactions_balance_cents_check" CHECK ((balance_cents >= 0));

alter table public.bankroll_transactions add constraint "bankroll_transactions_kind_check" CHECK ((kind = ANY (ARRAY['START'::text, 'RESERVE'::text, 'SETTLEMENT'::text])));

alter table public.bankroll_transactions add constraint "bankroll_transactions_pick_id_kind_key" UNIQUE (pick_id, kind);

alter table public.bankroll_transactions add constraint "bankroll_transactions_pkey" PRIMARY KEY (id);

alter table public.candidate_releases add constraint "candidate_releases_candidates_check" CHECK (((jsonb_typeof(candidates) = 'array'::text) AND ((jsonb_array_length(candidates) >= 1) AND (jsonb_array_length(candidates) <=
CASE
    WHEN private.is_weekly_sleeper(candidates) THEN 13
    ELSE 12
END))));

alter table public.candidate_releases add constraint "candidate_releases_pkey" PRIMARY KEY (id);

alter table public.candidate_releases add constraint "candidate_releases_publication_key_key" UNIQUE (publication_key);

alter table public.challenge_checkins add constraint "challenge_checkins_pkey" PRIMARY KEY (user_id, challenge_id, stage_number);

alter table public.challenge_checkins add constraint "challenge_checkins_stage_number_check" CHECK (((stage_number >= 1) AND (stage_number <= 5)));

alter table public.challenge_runs add constraint "challenge_runs_mode_check" CHECK ((mode = ANY (ARRAY['follow'::text, 'track'::text])));

alter table public.challenge_runs add constraint "challenge_runs_pkey" PRIMARY KEY (user_id, challenge_id);

alter table public.challenge_stages add constraint "challenge_stages_challenge_id_stage_number_key" UNIQUE (challenge_id, stage_number);

alter table public.challenge_stages add constraint "challenge_stages_pkey" PRIMARY KEY (id);

alter table public.challenge_stages add constraint "challenge_stages_stage_number_check" CHECK (((stage_number >= 1) AND (stage_number <= 5)));

alter table public.challenge_stages add constraint "challenge_stages_status_check" CHECK ((status = ANY (ARRAY['PREP'::text, 'ANALYSIS IN PROGRESS'::text, 'OFFICIAL PLAY'::text, 'WON'::text, 'LOST'::text, 'PUSH'::text, 'PASS / PAUSED'::text, 'COMPLETED'::text])));

alter table public.challenges add constraint "challenges_balance_cents_check" CHECK ((balance_cents >= 0));

alter table public.challenges add constraint "challenges_current_stage_check" CHECK (((current_stage >= 1) AND (current_stage <= 5)));

alter table public.challenges add constraint "challenges_number_key" UNIQUE (number);

alter table public.challenges add constraint "challenges_pkey" PRIMARY KEY (id);

alter table public.challenges add constraint "challenges_starting_cents_check" CHECK ((starting_cents = 2000));

alter table public.challenges add constraint "challenges_status_check" CHECK ((status = ANY (ARRAY['PREP'::text, 'ANALYSIS IN PROGRESS'::text, 'OFFICIAL PLAY'::text, 'WON'::text, 'LOST'::text, 'PUSH'::text, 'PASS / PAUSED'::text, 'COMPLETED'::text])));

alter table public.closing_lines add constraint "closing_lines_odds_check" CHECK (((abs(odds) >= (100)::numeric) AND (abs(odds) <= (100000)::numeric)));

alter table public.closing_lines add constraint "closing_lines_pick_id_key" UNIQUE (pick_id);

alter table public.closing_lines add constraint "closing_lines_pkey" PRIMARY KEY (id);

alter table public.community_comment_reactions add constraint "community_comment_reactions_pkey" PRIMARY KEY (comment_id, user_id);

alter table public.community_poll_votes add constraint "community_poll_votes_option_index_check" CHECK (((option_index >= 0) AND (option_index <= 3)));

alter table public.community_poll_votes add constraint "community_poll_votes_pkey" PRIMARY KEY (post_id, user_id);

alter table public.community_polls add constraint "community_polls_options_check" CHECK (((jsonb_typeof(options) = 'array'::text) AND ((jsonb_array_length(options) >= 2) AND (jsonb_array_length(options) <= 4))));

alter table public.community_polls add constraint "community_polls_pkey" PRIMARY KEY (post_id);

alter table public.community_polls add constraint "community_polls_question_check" CHECK (((length(btrim(question)) >= 1) AND (length(btrim(question)) <= 140)));

alter table public.community_post_comments add constraint "community_post_comments_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 1000)));

alter table public.community_post_comments add constraint "community_post_comments_pkey" PRIMARY KEY (id);

alter table public.community_post_comments add constraint "community_reply_not_self" CHECK ((parent_id IS DISTINCT FROM id));

alter table public.community_post_votes add constraint "community_post_votes_pkey" PRIMARY KEY (post_id, user_id);

alter table public.community_post_votes add constraint "community_post_votes_value_check" CHECK ((value = ANY (ARRAY['-1'::integer, 1])));

alter table public.community_posts add constraint "community_photo_identity" CHECK (((photo_path IS NULL) OR (photo_path = ((((user_id)::text || '/'::text) || (id)::text) || '.jpg'::text))));

alter table public.community_posts add constraint "community_posts_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 2000)));

alter table public.community_posts add constraint "community_posts_card_check" CHECK (((card IS NULL) OR (card ~ '^nba-threes:[0-9]{4}-[0-9]{2}-[0-9]{2}$'::text) OR (card = 'vq-publication:v1'::text) OR (card ~ '^nfl-(wr|dvp):[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]{1,2}$'::text) OR (card ~ '^nhl-charts:[0-9a-f-]{36}$'::text)));

alter table public.community_posts add constraint "community_posts_kind_check" CHECK ((kind = ANY (ARRAY['slip'::text, 'talk'::text, 'result'::text])));

alter table public.community_posts add constraint "community_posts_legs_check" CHECK ((jsonb_typeof(legs) = 'array'::text));

alter table public.community_posts add constraint "community_posts_pkey" PRIMARY KEY (id);

alter table public.community_posts add constraint "community_posts_sport_check" CHECK ((sport = ANY (ARRAY['nfl'::text, 'nba'::text, 'nhl'::text, 'ncaab'::text])));

alter table public.community_posts add constraint "community_posts_stake_check" CHECK (((stake >= (0)::numeric) AND (stake <= (1000000)::numeric)));

alter table public.community_posts add constraint "community_posts_title_check" CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 120)));

alter table public.community_profiles add constraint "community_profiles_avatar_check" CHECK (((avatar IS NULL) OR ((length(avatar) <= 120000) AND (avatar ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$'::text))));

alter table public.community_profiles add constraint "community_profiles_bio_check" CHECK ((length(bio) <= 280));

alter table public.community_profiles add constraint "community_profiles_instagram_url_check" CHECK (((instagram_url IS NULL) OR (instagram_url ~ '^https://(www\.)?instagram\.com/[A-Za-z0-9_.]{1,30}/?$'::text)));

alter table public.community_profiles add constraint "community_profiles_pkey" PRIMARY KEY (user_id);

alter table public.community_profiles add constraint "community_profiles_region_check" CHECK ((region = ANY (ARRAY[''::text, 'Northeast'::text, 'Southeast'::text, 'Midwest'::text, 'Southwest'::text, 'West Coast'::text, 'Mountain West'::text, 'Outside the US'::text])));

alter table public.community_profiles add constraint "community_profiles_state_check" CHECK ((state = ANY (ARRAY[''::text, 'AL'::text, 'AK'::text, 'AZ'::text, 'AR'::text, 'CA'::text, 'CO'::text, 'CT'::text, 'DE'::text, 'DC'::text, 'FL'::text, 'GA'::text, 'HI'::text, 'ID'::text, 'IL'::text, 'IN'::text, 'IA'::text, 'KS'::text, 'KY'::text, 'LA'::text, 'ME'::text, 'MD'::text, 'MA'::text, 'MI'::text, 'MN'::text, 'MS'::text, 'MO'::text, 'MT'::text, 'NE'::text, 'NV'::text, 'NH'::text, 'NJ'::text, 'NM'::text, 'NY'::text, 'NC'::text, 'ND'::text, 'OH'::text, 'OK'::text, 'OR'::text, 'PA'::text, 'RI'::text, 'SC'::text, 'SD'::text, 'TN'::text, 'TX'::text, 'UT'::text, 'VT'::text, 'VA'::text, 'WA'::text, 'WV'::text, 'WI'::text, 'WY'::text])));

alter table public.community_profiles add constraint "community_profiles_tagline_check" CHECK ((length(tagline) <= 60));

alter table public.community_profiles add constraint "community_profiles_username_check" CHECK ((username ~ '^[A-Za-z0-9_]{3,24}$'::text));

alter table public.community_profiles add constraint "community_profiles_x_url_check" CHECK (((x_url IS NULL) OR (x_url ~ '^https://(www\.)?(x|twitter)\.com/[A-Za-z0-9_]{1,15}/?$'::text)));

alter table public.community_reactions add constraint "community_reactions_pkey" PRIMARY KEY (post_id, user_id);

alter table public.community_reactions add constraint "community_reactions_reaction_type_check" CHECK ((reaction_type = ANY (ARRAY['heart'::text, 'celebrate'::text, 'fire'::text, 'thinking'::text])));

alter table public.community_reports add constraint "community_reports_pkey" PRIMARY KEY (id);

alter table public.community_reports add constraint "community_reports_post_id_user_id_key" UNIQUE (post_id, user_id);

alter table public.community_reports add constraint "community_reports_reason_check" CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)));

alter table public.community_shares add constraint "community_shares_pkey" PRIMARY KEY (post_id, user_id);

alter table public.edge_releases add constraint "edge_releases_id_key" UNIQUE (id);

alter table public.edge_releases add constraint "edge_releases_items_check" CHECK (((jsonb_typeof(items) = 'array'::text) AND ((jsonb_array_length(items) >= 1) AND (jsonb_array_length(items) <= 3))));

alter table public.edge_releases add constraint "edge_releases_pkey" PRIMARY KEY (official_pick_id);

alter table public.intelligence_markets add constraint "intelligence_markets_check" CHECK ((selection <> opposite));

alter table public.intelligence_markets add constraint "intelligence_markets_game_id_market_key_key" UNIQUE (game_id, market_key);

alter table public.intelligence_markets add constraint "intelligence_markets_label_check" CHECK (((length(TRIM(BOTH FROM label)) >= 1) AND (length(TRIM(BOTH FROM label)) <= 200)));

alter table public.intelligence_markets add constraint "intelligence_markets_market_key_check" CHECK (((length(TRIM(BOTH FROM market_key)) >= 1) AND (length(TRIM(BOTH FROM market_key)) <= 120)));

alter table public.intelligence_markets add constraint "intelligence_markets_market_type_check" CHECK ((market_type = ANY (ARRAY['Side'::text, 'Moneyline'::text, 'Total'::text, 'Player Prop'::text])));

alter table public.intelligence_markets add constraint "intelligence_markets_official_pick_id_key" UNIQUE (official_pick_id);

alter table public.intelligence_markets add constraint "intelligence_markets_opposite_check" CHECK (((length(TRIM(BOTH FROM opposite)) >= 1) AND (length(TRIM(BOTH FROM opposite)) <= 200)));

alter table public.intelligence_markets add constraint "intelligence_markets_period_check" CHECK (((length(TRIM(BOTH FROM period)) >= 1) AND (length(TRIM(BOTH FROM period)) <= 100)));

alter table public.intelligence_markets add constraint "intelligence_markets_pkey" PRIMARY KEY (id);

alter table public.intelligence_markets add constraint "intelligence_markets_rules_check" CHECK (((length(TRIM(BOTH FROM rules)) >= 1) AND (length(TRIM(BOTH FROM rules)) <= 2000)));

alter table public.intelligence_markets add constraint "intelligence_markets_selection_check" CHECK (((length(TRIM(BOTH FROM selection)) >= 1) AND (length(TRIM(BOTH FROM selection)) <= 200)));

alter table public.intelligence_models add constraint "intelligence_models_check" CHECK (((sharp_fair_line IS NULL) OR (COALESCE(length(TRIM(BOTH FROM sharp_method)), 0) > 0)));

alter table public.intelligence_models add constraint "intelligence_models_notes_check" CHECK ((length(notes) <= 10000));

alter table public.intelligence_models add constraint "intelligence_models_observed_at_check" CHECK ((isfinite(observed_at) AND (observed_at <= (now() + '00:05:00'::interval))));

alter table public.intelligence_models add constraint "intelligence_models_pkey" PRIMARY KEY (id);

alter table public.intelligence_models add constraint "intelligence_models_probability_check" CHECK (((probability >= (0)::numeric) AND (probability <= (100)::numeric)));

alter table public.intelligence_models add constraint "intelligence_models_probability_line_check" CHECK (((probability_line >= ('-100000'::integer)::numeric) AND (probability_line <= (100000)::numeric)));

alter table public.intelligence_models add constraint "intelligence_models_projection_check" CHECK (((length(TRIM(BOTH FROM projection)) >= 1) AND (length(TRIM(BOTH FROM projection)) <= 2000)));

alter table public.intelligence_models add constraint "intelligence_models_sharp_fair_line_check" CHECK (((sharp_fair_line >= ('-100000'::integer)::numeric) AND (sharp_fair_line <= (100000)::numeric)));

alter table public.intelligence_models add constraint "intelligence_models_source_check" CHECK (((length(TRIM(BOTH FROM source)) >= 1) AND (length(TRIM(BOTH FROM source)) <= 2000)));

alter table public.intelligence_models add constraint "intelligence_models_true_line_check" CHECK (((true_line >= ('-100000'::integer)::numeric) AND (true_line <= (100000)::numeric)));

alter table public.intelligence_news add constraint "intelligence_news_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 20000)));

alter table public.intelligence_news add constraint "intelligence_news_category_check" CHECK ((category = ANY (ARRAY['Injury'::text, 'Weather'::text, 'Team'::text, 'Other'::text])));

alter table public.intelligence_news add constraint "intelligence_news_headline_check" CHECK (((length(TRIM(BOTH FROM headline)) >= 1) AND (length(TRIM(BOTH FROM headline)) <= 300)));

alter table public.intelligence_news add constraint "intelligence_news_observed_at_check" CHECK ((isfinite(observed_at) AND (observed_at <= (now() + '00:05:00'::interval))));

alter table public.intelligence_news add constraint "intelligence_news_pkey" PRIMARY KEY (id);

alter table public.intelligence_news add constraint "intelligence_news_source_check" CHECK (((length(TRIM(BOTH FROM source)) >= 1) AND (length(TRIM(BOTH FROM source)) <= 2000)));

alter table public.intelligence_news add constraint "intelligence_news_time_basis_check" CHECK ((time_basis = ANY (ARRAY['observed'::text, 'received'::text, 'published'::text])));

alter table public.intelligence_quotes add constraint "intelligence_quotes_book_check" CHECK (((length(TRIM(BOTH FROM book)) >= 1) AND (length(TRIM(BOTH FROM book)) <= 100)));

alter table public.intelligence_quotes add constraint "intelligence_quotes_line_check" CHECK (((line >= ('-100000'::integer)::numeric) AND (line <= (100000)::numeric)));

alter table public.intelligence_quotes add constraint "intelligence_quotes_notes_check" CHECK ((length(notes) <= 10000));

alter table public.intelligence_quotes add constraint "intelligence_quotes_observed_at_check" CHECK ((isfinite(observed_at) AND (observed_at <= (now() + '00:05:00'::interval))));

alter table public.intelligence_quotes add constraint "intelligence_quotes_odds_check" CHECK (((abs(odds) >= (100)::numeric) AND (abs(odds) <= (100000)::numeric)));

alter table public.intelligence_quotes add constraint "intelligence_quotes_opposite_odds_check" CHECK (((abs(opposite_odds) >= (100)::numeric) AND (abs(opposite_odds) <= (100000)::numeric)));

alter table public.intelligence_quotes add constraint "intelligence_quotes_pkey" PRIMARY KEY (id);

alter table public.intelligence_quotes add constraint "intelligence_quotes_source_check" CHECK (((length(TRIM(BOTH FROM source)) >= 1) AND (length(TRIM(BOTH FROM source)) <= 2000)));

alter table public.intelligence_quotes add constraint "intelligence_quotes_time_basis_check" CHECK ((time_basis = ANY (ARRAY['observed'::text, 'received'::text, 'published'::text])));

alter table public.leg_book_prices add constraint "leg_book_prices_book_check" CHECK ((length(TRIM(BOTH FROM book)) > 0));

alter table public.leg_book_prices add constraint "leg_book_prices_check" CHECK ((observed_at <= (kickoff + '00:05:00'::interval)));

alter table public.leg_book_prices add constraint "leg_book_prices_pkey" PRIMARY KEY (leg_key, book);

alter table public.leg_book_prices add constraint "leg_book_prices_price_check" CHECK ((abs(price) >= (100)::numeric));

alter table public.leg_history add constraint "leg_history_check" CHECK ((((sample >= 0) AND (sample <= 10)) AND (cleared <= sample)));

alter table public.leg_history add constraint "leg_history_cleared_check" CHECK ((cleared >= 0));

alter table public.leg_history add constraint "leg_history_games_check" CHECK ((jsonb_typeof(games) = 'array'::text));

alter table public.leg_history add constraint "leg_history_pkey" PRIMARY KEY (leg_key);

alter table public.leg_market_prices add constraint "leg_market_prices_check" CHECK ((last_observed_at <= (kickoff + '00:05:00'::interval)));

alter table public.leg_market_prices add constraint "leg_market_prices_first_price_check" CHECK ((abs(first_price) >= (100)::numeric));

alter table public.leg_market_prices add constraint "leg_market_prices_last_price_check" CHECK ((abs(last_price) >= (100)::numeric));

alter table public.leg_market_prices add constraint "leg_market_prices_pkey" PRIMARY KEY (leg_key);

alter table public.leg_result_progress add constraint "leg_result_progress_pkey" PRIMARY KEY (leg_key);

alter table public.leg_result_progress add constraint "leg_result_progress_source_url_check" CHECK ((source_url ~ '^https://'::text));

alter table public.leg_result_progress add constraint "leg_result_progress_status_check" CHECK ((status = ANY (ARRAY['TRACKING'::text, 'TARGET_REACHED_LIVE'::text, 'AWAITING_CORROBORATION'::text, 'FINAL'::text, 'CONFLICT'::text, 'BLOCKED'::text])));

alter table public.leg_tails add constraint "leg_tails_pkey" PRIMARY KEY (user_id, leg_key);

alter table public.member_blocks add constraint "member_blocks_check" CHECK ((user_id <> target_user_id));

alter table public.member_blocks add constraint "member_blocks_label_check" CHECK ((length(label) <= 80));

alter table public.member_blocks add constraint "member_blocks_pkey" PRIMARY KEY (user_id, target_user_id);

alter table public.member_follows add constraint "member_follows_check" CHECK ((user_id <> target_user_id));

alter table public.member_follows add constraint "member_follows_pkey" PRIMARY KEY (user_id, target_user_id);

alter table public.member_parlays add constraint "member_parlays_leg_keys_check" CHECK ((cardinality(leg_keys) >= 2));

alter table public.member_parlays add constraint "member_parlays_legs_check" CHECK (((jsonb_typeof(legs) = 'array'::text) AND (jsonb_array_length(legs) >= 2)));

alter table public.member_parlays add constraint "member_parlays_pkey" PRIMARY KEY (id);

alter table public.member_parlays add constraint "member_parlays_title_check" CHECK (((length(TRIM(BOTH FROM title)) >= 1) AND (length(TRIM(BOTH FROM title)) <= 80)));

alter table public.member_parlays add constraint "member_parlays_user_id_leg_keys_key" UNIQUE (user_id, leg_keys);

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_analysis_kind_check" CHECK ((analysis_kind = 'QUALITATIVE_EDITORIAL'::text));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_book_check" CHECK ((book = 'FanDuel'::text));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_direction_check" CHECK ((direction = ANY (ARRAY['Over'::text, 'Under'::text])));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_evidence_check" CHECK ((jsonb_typeof(evidence) = 'object'::text));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_line_check" CHECK (((line >= (0)::numeric) AND (line < (200)::numeric)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_market_check" CHECK ((market = ANY (ARRAY['player_points'::text, 'player_rebounds'::text])));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_odds_check" CHECK (((abs(odds) >= 100) AND (abs(odds) <= 100000)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_pkey" PRIMARY KEY (id);

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_player_check" CHECK (((length(player) >= 1) AND (length(player) <= 100)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_publication_key_check" CHECK (((length(publication_key) >= 1) AND (length(publication_key) <= 180)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_publication_key_key" UNIQUE (publication_key);

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_quote_source_url_check" CHECK ((quote_source_url ~~ 'https://%'::text));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_rationale_check" CHECK (((length(rationale) >= 30) AND (length(rationale) <= 1500)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_risk_check" CHECK (((length(risk) >= 20) AND (length(risk) <= 1500)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_sources_check" CHECK (((jsonb_typeof(sources) = 'array'::text) AND (jsonb_array_length(sources) >= 2)));

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_unknowns_check" CHECK (((length(unknowns) >= 10) AND (length(unknowns) <= 1500)));

alter table public.nba_game_results add constraint "nba_game_results_away_score_check" CHECK ((away_score >= 0));

alter table public.nba_game_results add constraint "nba_game_results_check" CHECK ((away_score <> home_score));

alter table public.nba_game_results add constraint "nba_game_results_fingerprint_check" CHECK ((fingerprint ~ '^[a-f0-9]{64}$'::text));

alter table public.nba_game_results add constraint "nba_game_results_home_score_check" CHECK ((home_score >= 0));

alter table public.nba_game_results add constraint "nba_game_results_pkey" PRIMARY KEY (game_id);

alter table public.nba_game_results add constraint "nba_game_results_provider_id_key" UNIQUE (provider_id);

alter table public.nba_game_results add constraint "nba_game_results_source_hash_check" CHECK ((source_hash ~ '^[a-f0-9]{64}$'::text));

alter table public.nba_game_results add constraint "nba_game_results_source_url_check" CHECK ((source_url ~~ 'https://www.espn.com/nba/boxscore/_/gameId/%'::text));

alter table public.nba_player_results add constraint "nba_player_results_assists_check" CHECK ((assists >= 0));

alter table public.nba_player_results add constraint "nba_player_results_athlete_id_check" CHECK ((athlete_id ~ '^\d+$'::text));

alter table public.nba_player_results add constraint "nba_player_results_blocks_check" CHECK ((blocks >= 0));

alter table public.nba_player_results add constraint "nba_player_results_minutes_check" CHECK ((minutes >= 0));

alter table public.nba_player_results add constraint "nba_player_results_pkey" PRIMARY KEY (game_id, athlete_id);

alter table public.nba_player_results add constraint "nba_player_results_points_check" CHECK ((points >= 0));

alter table public.nba_player_results add constraint "nba_player_results_rebounds_check" CHECK ((rebounds >= 0));

alter table public.nba_player_results add constraint "nba_player_results_side_check" CHECK ((side = ANY (ARRAY['away'::text, 'home'::text])));

alter table public.nba_player_results add constraint "nba_player_results_steals_check" CHECK ((steals >= 0));

alter table public.nba_player_results add constraint "nba_player_results_threes_check" CHECK ((threes >= 0));

alter table public.nba_player_results add constraint "nba_player_results_turnovers_check" CHECK ((turnovers >= 0));

alter table public.nba_player_shooting add constraint "nba_player_shooting_check" CHECK (((fgm <= fga) AND (ftm <= fta)));

alter table public.nba_player_shooting add constraint "nba_player_shooting_fga_check" CHECK (((fga >= 0) AND (fga <= 99)));

alter table public.nba_player_shooting add constraint "nba_player_shooting_fgm_check" CHECK (((fgm >= 0) AND (fgm <= 99)));

alter table public.nba_player_shooting add constraint "nba_player_shooting_fta_check" CHECK (((fta >= 0) AND (fta <= 99)));

alter table public.nba_player_shooting add constraint "nba_player_shooting_ftm_check" CHECK (((ftm >= 0) AND (ftm <= 99)));

alter table public.nba_player_shooting add constraint "nba_player_shooting_pkey" PRIMARY KEY (game_id, athlete_id);

alter table public.nba_player_three_attempts add constraint "nba_player_three_attempts_attempts_check" CHECK (((attempts >= 0) AND (attempts <= 99)));

alter table public.nba_player_three_attempts add constraint "nba_player_three_attempts_pkey" PRIMARY KEY (game_id, athlete_id);

alter table public.nba_result_progress add constraint "nba_result_progress_pkey" PRIMARY KEY (game_id);

alter table public.nba_result_progress add constraint "nba_result_progress_status_check" CHECK ((status = ANY (ARRAY['AWAITING_FINAL'::text, 'CONFIRMING'::text, 'FINAL'::text, 'INCONSISTENT'::text, 'CONFLICT'::text, 'NO_RESULT'::text])));

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_candidates_check" CHECK (((jsonb_typeof(candidates) = 'array'::text) AND (jsonb_array_length(candidates) = ANY (ARRAY[1, 3, 4]))));

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_combined_odds_check" CHECK (((combined_odds >= 100) AND (combined_odds <= 100000)));

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_day_key" UNIQUE (day);

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_pkey" PRIMARY KEY (id);

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_title_check" CHECK (((length(title) >= 1) AND (length(title) <= 90)));

alter table public.notification_preferences add constraint "notification_preferences_batch_minutes_check" CHECK (((batch_minutes >= 1) AND (batch_minutes <= 30)));

alter table public.notification_preferences add constraint "notification_preferences_pkey" PRIMARY KEY (user_id);

alter table public.notification_preferences add constraint "notification_preferences_quiet_end_check" CHECK (((quiet_end >= 0) AND (quiet_end <= 23)));

alter table public.notification_preferences add constraint "notification_preferences_quiet_start_check" CHECK (((quiet_start >= 0) AND (quiet_start <= 23)));

alter table public.notification_preferences add constraint "notification_preferences_types_check" CHECK ((disabled_types <@ ARRAY['like'::text, 'comment'::text, 'reply'::text, 'mention'::text, 'follow'::text, 'share'::text, 'comment_reaction'::text, 'message'::text, 'group_message'::text, 'message_request'::text, 'message_reminder'::text, 'welcome'::text, 'profile_reminder'::text, 'security'::text, 'password_change'::text, 'account'::text, 'feature'::text, 'suggestion'::text, 'contributor'::text, 'post'::text, 'pick'::text]));

alter table public.notifications add constraint "notifications_deep_link_check" CHECK ((((deep_link ~ '^/(community|notifications|membership|account|messages|feed)([/?#]|$)'::text) OR (deep_link ~ '^/(nba|nhl|ncaab)/games/[a-z0-9-]{1,120}$'::text)) AND (deep_link !~ '^//'::text)));

alter table public.notifications add constraint "notifications_message_check" CHECK ((length(message) <= 400));

alter table public.notifications add constraint "notifications_pkey" PRIMARY KEY (id);

alter table public.notifications add constraint "notifications_priority_check" CHECK ((priority = ANY (ARRAY['critical'::text, 'high'::text, 'medium'::text, 'low'::text])));

alter table public.notifications add constraint "notifications_recipient_id_group_key_key" UNIQUE (recipient_id, group_key);

alter table public.notifications add constraint "notifications_type_check" CHECK ((type = ANY (ARRAY['like'::text, 'comment'::text, 'reply'::text, 'mention'::text, 'follow'::text, 'share'::text, 'comment_reaction'::text, 'message'::text, 'group_message'::text, 'message_request'::text, 'message_reminder'::text, 'welcome'::text, 'profile_reminder'::text, 'security'::text, 'password_change'::text, 'account'::text, 'feature'::text, 'suggestion'::text, 'contributor'::text, 'post'::text, 'pick'::text])));

alter table public.official_picks add constraint "official_picks_check" CHECK (((market = 'Moneyline'::text) OR (recommended_line IS NOT NULL)));

alter table public.official_picks add constraint "official_picks_check1" CHECK (((market <> ALL (ARRAY['Total'::text, 'Player Prop'::text])) OR (direction IS NOT NULL)));

alter table public.official_picks add constraint "official_picks_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (10)::numeric)));

alter table public.official_picks add constraint "official_picks_direction_check" CHECK ((direction = ANY (ARRAY['over'::text, 'under'::text])));

alter table public.official_picks add constraint "official_picks_edge_check" CHECK (((edge >= (3)::numeric) AND (edge <= (100)::numeric)));

alter table public.official_picks add constraint "official_picks_fear_index_check" CHECK (((fear_index >= (0)::numeric) AND (fear_index <= (10)::numeric)));

alter table public.official_picks add constraint "official_picks_gambly_url_check" CHECK (((gambly_url IS NULL) OR ((length(gambly_url) <= 2048) AND (gambly_url ~ '^https://(www\.)?gambly\.com(/[^[:space:]]*)?$'::text))));

alter table public.official_picks add constraint "official_picks_market_check" CHECK ((market = ANY (ARRAY['Side'::text, 'Total'::text, 'Player Prop'::text, 'Moneyline'::text])));

alter table public.official_picks add constraint "official_picks_market_info_url_check" CHECK (((market_info_url IS NULL) OR (market_info_url = ANY (ARRAY['https://www.espn.com/nfl/odds'::text, 'https://www.scoresandodds.com/nfl/odds'::text, 'https://www.covers.com/sport/football/nfl/odds'::text]))));

alter table public.official_picks add constraint "official_picks_market_probability_check" CHECK (((market_probability >= (0)::numeric) AND (market_probability <= (100)::numeric)));

alter table public.official_picks add constraint "official_picks_model_probability_check" CHECK (((model_probability >= (0)::numeric) AND (model_probability <= (100)::numeric)));

alter table public.official_picks add constraint "official_picks_odds_check" CHECK (((abs(odds) >= (100)::numeric) AND (abs(odds) <= (100000)::numeric)));

alter table public.official_picks add constraint "official_picks_pkey" PRIMARY KEY (id);

alter table public.official_picks add constraint "official_picks_risk_check" CHECK (((risk >= (0)::numeric) AND (risk <= (10)::numeric)));

alter table public.official_picks add constraint "official_picks_rule_ids_check" CHECK ((array_to_string(rule_ids, ','::text) ~ '^(R-(0[1-9]|[1-3][0-9]|40)(,R-(0[1-9]|[1-3][0-9]|40))*)?$'::text));

alter table public.official_picks add constraint "official_picks_selection_check" CHECK ((length(selection) > 0));

alter table public.official_picks add constraint "official_picks_stage_id_key" UNIQUE (stage_id);

alter table public.official_picks add constraint "official_picks_stake_cents_check" CHECK ((stake_cents > 0));

alter table public.onboarding_events add constraint "onboarding_events_event_check" CHECK ((event = ANY (ARRAY['profile_completed'::text, 'notifications_enabled'::text, 'first_saved_leg'::text])));

alter table public.onboarding_events add constraint "onboarding_events_pkey" PRIMARY KEY (user_id, event);

alter table public.personal_challenges add constraint "personal_challenges_pkey" PRIMARY KEY (id);

alter table public.personal_challenges add constraint "personal_challenges_starting_cents_check" CHECK (((starting_cents >= 1) AND (starting_cents <= 100000000)));

alter table public.personal_challenges add constraint "personal_challenges_user_id_challenge_id_key" UNIQUE (user_id, challenge_id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_note_check" CHECK (((length(TRIM(BOTH FROM note)) >= 3) AND (length(TRIM(BOTH FROM note)) <= 2000)));

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_pkey" PRIMARY KEY (id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_request_id_key" UNIQUE (request_id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_result_override_check" CHECK ((result_override = ANY (ARRAY['WIN'::text, 'LOSS'::text, 'PUSH'::text, 'VOID'::text])));

alter table public.personal_correction_requests add constraint "personal_correction_requests_pkey" PRIMARY KEY (id);

alter table public.personal_correction_requests add constraint "personal_correction_requests_reason_check" CHECK (((length(TRIM(BOTH FROM reason)) >= 3) AND (length(TRIM(BOTH FROM reason)) <= 2000)));

alter table public.personal_entries add constraint "personal_entries_book_check" CHECK (((length(TRIM(BOTH FROM book)) >= 1) AND (length(TRIM(BOTH FROM book)) <= 100)));

alter table public.personal_entries add constraint "personal_entries_check" CHECK (((payout_cents >= stake_cents) AND (payout_cents <= 100000000)));

alter table public.personal_entries add constraint "personal_entries_odds_check" CHECK (((abs(odds) >= (100)::numeric) AND (abs(odds) <= (100000)::numeric)));

alter table public.personal_entries add constraint "personal_entries_pkey" PRIMARY KEY (id);

alter table public.personal_entries add constraint "personal_entries_stake_cents_check" CHECK (((stake_cents >= 1) AND (stake_cents <= 100000000)));

alter table public.personal_entries add constraint "personal_entries_user_id_pick_id_key" UNIQUE (user_id, pick_id);

alter table public.personal_run_events add constraint "personal_run_events_pkey" PRIMARY KEY (id);

alter table public.personal_settlements add constraint "personal_settlements_entry_id_key" UNIQUE (entry_id);

alter table public.personal_settlements add constraint "personal_settlements_pkey" PRIMARY KEY (id);

alter table public.personal_settlements add constraint "personal_settlements_result_check" CHECK ((result = ANY (ARRAY['WIN'::text, 'LOSS'::text, 'PUSH'::text, 'VOID'::text])));

alter table public.pick_entries add constraint "pick_entries_odds_check" CHECK (((abs(odds) >= (100)::numeric) AND (abs(odds) <= (100000)::numeric)));

alter table public.pick_entries add constraint "pick_entries_pick_id_key" UNIQUE (pick_id);

alter table public.pick_entries add constraint "pick_entries_pkey" PRIMARY KEY (id);

alter table public.pick_results add constraint "pick_results_away_score_check" CHECK ((away_score >= 0));

alter table public.pick_results add constraint "pick_results_home_score_check" CHECK ((home_score >= 0));

alter table public.pick_results add constraint "pick_results_pick_id_key" UNIQUE (pick_id);

alter table public.pick_results add constraint "pick_results_pkey" PRIMARY KEY (id);

alter table public.pick_results add constraint "pick_results_result_check" CHECK ((result = ANY (ARRAY['WIN'::text, 'LOSS'::text, 'PUSH'::text, 'VOID'::text])));

alter table private.account_erasure_jobs add constraint "account_erasure_jobs_pkey" PRIMARY KEY (user_id);

alter table private.admin_users add constraint "admin_users_pkey" PRIMARY KEY (user_id);

alter table private.community_restrictions add constraint "community_restrictions_pkey" PRIMARY KEY (user_id);

alter table private.community_restrictions add constraint "community_restrictions_reason_check" CHECK (((length(TRIM(BOTH FROM reason)) >= 1) AND (length(TRIM(BOTH FROM reason)) <= 500)));

alter table private.editorial_parlay_results add constraint "editorial_parlay_results_pkey" PRIMARY KEY (leg_key);

alter table private.leg_move_alerts add constraint "leg_move_alerts_direction_check" CHECK ((direction = ANY (ARRAY['against'::text, 'toward'::text])));

alter table private.leg_move_alerts add constraint "leg_move_alerts_pkey" PRIMARY KEY (leg_key, direction);

alter table private.leg_result_contracts add constraint "leg_result_contracts_metric_check" CHECK ((metric = ANY (ARRAY['rushing_yards'::text, 'receiving_yards'::text, 'passing_yards'::text, 'receptions'::text, 'def_sacks'::text])));

alter table private.leg_result_contracts add constraint "leg_result_contracts_operator_check" CHECK ((operator = ANY (ARRAY['gte'::text, 'over'::text, 'under'::text])));

alter table private.leg_result_contracts add constraint "leg_result_contracts_period_check" CHECK ((period = 'full_game'::text));

alter table private.leg_result_contracts add constraint "leg_result_contracts_pkey" PRIMARY KEY (leg_key);

alter table private.leg_result_contracts add constraint "leg_result_contracts_threshold_check" CHECK ((threshold >= (0)::numeric));

alter table private.leg_result_contracts add constraint "sack_half_step" CHECK (((metric <> 'def_sacks'::text) OR ((threshold * (2)::numeric) = trunc((threshold * (2)::numeric)))));

alter table private.leg_result_evidence add constraint "leg_result_evidence_pkey" PRIMARY KEY (leg_key);

alter table private.live_pick_alerts add constraint "live_pick_alerts_pkey" PRIMARY KEY (pick_id);

alter table private.live_pick_alerts add constraint "live_pick_alerts_sport_check" CHECK ((sport = ANY (ARRAY['nba'::text, 'nhl'::text, 'ncaab'::text])));

alter table private.live_pick_alerts add constraint "live_pick_alerts_zone_attempts_check" CHECK (((zone_attempts >= 0) AND (zone_attempts <= 8)));

alter table private.live_pick_alerts add constraint "live_pick_alerts_zone_last_error_check" CHECK ((length(zone_last_error) <= 200));

alter table private.live_pick_alerts add constraint "live_pick_alerts_zone_status_check" CHECK ((zone_status = ANY (ARRAY['pending'::text, 'posted'::text, 'blocked'::text])));

alter table private.memberships add constraint "memberships_check" CHECK ((expires_at > starts_at));

alter table private.memberships add constraint "memberships_order_id_key" UNIQUE (order_id);

alter table private.memberships add constraint "memberships_pkey" PRIMARY KEY (id);

alter table private.memberships add constraint "memberships_plan_check" CHECK ((plan = ANY (ARRAY['full'::text, 'half'::text])));

alter table private.memberships add constraint "memberships_season_check" CHECK ((season = '2026'::text));

alter table private.nba_result_corrections add constraint "nba_result_corrections_game_id_observed_fingerprint_key" UNIQUE (game_id, observed_fingerprint);

alter table private.nba_result_corrections add constraint "nba_result_corrections_pkey" PRIMARY KEY (id);

alter table private.nba_result_staging add constraint "nba_result_staging_pkey" PRIMARY KEY (game_id);

alter table private.nba_threes_posts add constraint "nba_threes_posts_pkey" PRIMARY KEY (day);

alter table private.nfl_selection_gate_decisions add constraint "nfl_selection_gate_decisions_pkey" PRIMARY KEY (id);

alter table private.nfl_selection_identities add constraint "nfl_selection_identities_pkey" PRIMARY KEY (identity);

alter table private.nfl_selection_model_approvals add constraint "nfl_selection_model_approvals_pkey" PRIMARY KEY (model_id);

alter table private.nfl_selection_model_approvals add constraint "nfl_selection_model_approvals_validation_url_check" CHECK ((validation_url ~~ 'https://%'::text));

alter table private.nfl_selection_rule_versions add constraint "nfl_selection_rule_versions_pkey" PRIMARY KEY (version);

alter table private.nhl_chart_snapshots add constraint "nhl_chart_snapshots_game_id_day_key" UNIQUE (game_id, day);

alter table private.nhl_chart_snapshots add constraint "nhl_chart_snapshots_pkey" PRIMARY KEY (id);

alter table private.nhl_chart_snapshots add constraint "nhl_chart_snapshots_post_id_key" UNIQUE (post_id);

alter table private.notification_action_rates add constraint "notification_action_rates_pkey" PRIMARY KEY (user_id, window_at);

alter table private.notification_events add constraint "notification_events_pkey" PRIMARY KEY (recipient_id, event_key);

alter table private.notification_presence add constraint "notification_presence_pkey" PRIMARY KEY (user_id, device);

alter table private.publish_receipts add constraint "publish_receipts_pkey" PRIMARY KEY (request_id);

alter table private.research_identities add constraint "research_identities_pkey" PRIMARY KEY (identity);

alter table private.sports_sources add constraint "sports_sources_pkey" PRIMARY KEY (id);

alter table private.sports_sources add constraint "sports_sources_sha256_check" CHECK ((sha256 ~ '^[a-f0-9]{64}$'::text));

alter table private.sports_sources add constraint "sports_sources_url_check" CHECK ((url ~~ 'https://%'::text));

alter table private.sports_sources add constraint "sports_sources_url_sha256_key" UNIQUE (url, sha256);

alter table private.weekly_sleeper_reviews add constraint "weekly_sleeper_reviews_pkey" PRIMARY KEY (release_id);

alter table private.zone_post_games add constraint "zone_post_games_pkey" PRIMARY KEY (post_id, game_id);

alter table public.process_reviews add constraint "process_reviews_classification_check" CHECK ((classification = ANY (ARRAY['GOOD HANDICAP / GOOD RESULT'::text, 'GOOD HANDICAP / BAD VARIANCE'::text, 'BAD HANDICAP / DESERVED LOSS'::text, 'CORRECT READ / WRONG EXECUTION'::text])));

alter table public.process_reviews add constraint "process_reviews_grade_check" CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text, 'F'::text])));

alter table public.process_reviews add constraint "process_reviews_lessons_check" CHECK ((length(lessons) > 0));

alter table public.process_reviews add constraint "process_reviews_pkey" PRIMARY KEY (id);

alter table public.research_leg_results add constraint "research_leg_results_pkey" PRIMARY KEY (leg_key);

alter table public.research_leg_results add constraint "research_leg_results_result_check" CHECK ((result = ANY (ARRAY['WIN'::text, 'LOSS'::text, 'PUSH'::text, 'VOID'::text])));

alter table public.research_leg_results add constraint "research_leg_results_source_url_check" CHECK ((source_url ~ '^https://'::text));

alter table public.ruby_card_comments add constraint "ruby_card_comments_body_check" CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 1000)));

alter table public.ruby_card_comments add constraint "ruby_card_comments_check" CHECK ((parent_id IS DISTINCT FROM id));

alter table public.ruby_card_comments add constraint "ruby_card_comments_pkey" PRIMARY KEY (id);

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_content_source_check" CHECK (((jsonb_array_length(legs) >= 2) OR (photo_path IS NOT NULL) OR (source_link IS NOT NULL)));

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_pkey" PRIMARY KEY (id);

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_revision_check" CHECK ((revision > 0));

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_source_link_check" CHECK (((source_link IS NULL) OR ((private.normalize_kalshi_source_link(source_link) IS NOT NULL) AND (source_link = private.normalize_kalshi_source_link(source_link)))));

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_sport_check" CHECK ((sport = ANY (ARRAY['Soccer'::text, 'NFL'::text, 'NHL'::text, 'NBA'::text, 'NCAAB'::text, 'Baseball'::text, 'WNBA'::text])));

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_submission_id_revision_key" UNIQUE (submission_id, revision);

alter table public.ruby_card_revisions add constraint "ruby_submissions_check1" CHECK (((sportsbook IS NULL) = (reported_odds IS NULL)));

alter table public.ruby_card_revisions add constraint "ruby_submissions_legs_check" CHECK (((jsonb_typeof(legs) = 'array'::text) AND (jsonb_array_length(legs) <= 20)));

alter table public.ruby_card_revisions add constraint "ruby_submissions_note_check" CHECK ((length(note) <= 1000));

alter table public.ruby_card_revisions add constraint "ruby_submissions_reported_odds_check" CHECK ((((reported_odds >= '-100000'::integer) AND (reported_odds <= 100000)) AND (abs(reported_odds) >= 100)));

alter table public.ruby_card_revisions add constraint "ruby_submissions_sportsbook_check" CHECK (((length(sportsbook) >= 1) AND (length(sportsbook) <= 80)));

alter table public.ruby_card_revisions add constraint "ruby_submissions_title_check" CHECK (((length(title) >= 1) AND (length(title) <= 90)));

alter table public.ruby_contributors add constraint "ruby_contributors_brand_check" CHECK ((brand = ANY (ARRAY['OmaticsZone'::text, 'SoDegenerate'::text, 'FranksCorner'::text, 'HoustonMikesHub'::text, 'The GOAT'::text, 'MarkKuban'::text, 'TrapVegas'::text])));

alter table public.ruby_contributors add constraint "ruby_contributors_brand_key" UNIQUE (brand);

alter table public.ruby_contributors add constraint "ruby_contributors_check" CHECK (((((((((brand = 'OmaticsZone'::text) AND (theme = 'orbit'::text)) OR ((brand = 'SoDegenerate'::text) AND (theme = 'diagonal'::text))) OR ((brand = 'FranksCorner'::text) AND (theme = 'corner'::text))) OR ((brand = 'HoustonMikesHub'::text) AND (theme = 'skyline'::text))) OR ((brand = 'The GOAT'::text) AND (theme = 'diamond'::text))) OR ((brand = 'MarkKuban'::text) AND (theme = 'marquee'::text))) OR ((brand = 'TrapVegas'::text) AND (theme = 'encore'::text))));

alter table public.ruby_contributors add constraint "ruby_contributors_pkey" PRIMARY KEY (user_id);

alter table public.ruby_contributors add constraint "ruby_contributors_theme_check" CHECK ((theme = ANY (ARRAY['orbit'::text, 'diagonal'::text, 'corner'::text, 'skyline'::text, 'diamond'::text, 'marquee'::text, 'encore'::text])));

alter table public.ruby_contributors add constraint "ruby_contributors_theme_key" UNIQUE (theme);

alter table public.ruby_daily_features add constraint "daily_feature_exactly_one_ticket" CHECK (((((submission_id IS NOT NULL))::integer + ((analyst_ticket_id IS NOT NULL))::integer) = 1));

alter table public.ruby_daily_features add constraint "ruby_daily_features_pkey" PRIMARY KEY (day);

alter table public.ruby_daily_features add constraint "ruby_daily_features_source_url_check" CHECK ((source_url ~ '^https://[^[:space:]]+$'::text));

alter table public.ruby_daily_features add constraint "ruby_daily_features_sportsbook_check" CHECK (((length(sportsbook) >= 1) AND (length(sportsbook) <= 80)));

alter table public.ruby_daily_features add constraint "ruby_daily_features_verified_odds_check" CHECK (((verified_odds >= 100) AND (verified_odds <= 100000)));

alter table public.ruby_result_reports add constraint "ruby_result_reports_outcome_check" CHECK ((outcome = ANY (ARRAY['WIN'::text, 'LOSS'::text, 'VOID'::text, 'PENDING'::text])));

alter table public.ruby_result_reports add constraint "ruby_result_reports_pkey" PRIMARY KEY (id);

alter table public.ruby_submissions add constraint "ruby_submissions_check1" CHECK (((sportsbook IS NULL) = (reported_odds IS NULL)));

alter table public.ruby_submissions add constraint "ruby_submissions_content_source_check" CHECK (((jsonb_array_length(legs) >= 2) OR (photo_path IS NOT NULL) OR (source_link IS NOT NULL)));

alter table public.ruby_submissions add constraint "ruby_submissions_legs_check" CHECK (((jsonb_typeof(legs) = 'array'::text) AND (jsonb_array_length(legs) <= 20)));

alter table public.ruby_submissions add constraint "ruby_submissions_note_check" CHECK ((length(note) <= 1000));

alter table public.ruby_submissions add constraint "ruby_submissions_pkey" PRIMARY KEY (id);

alter table public.ruby_submissions add constraint "ruby_submissions_reported_odds_check" CHECK ((((reported_odds >= '-100000'::integer) AND (reported_odds <= 100000)) AND (abs(reported_odds) >= 100)));

alter table public.ruby_submissions add constraint "ruby_submissions_source_link_check" CHECK (((source_link IS NULL) OR ((private.normalize_kalshi_source_link(source_link) IS NOT NULL) AND (source_link = private.normalize_kalshi_source_link(source_link)))));

alter table public.ruby_submissions add constraint "ruby_submissions_sport_check" CHECK ((sport = ANY (ARRAY['Soccer'::text, 'NFL'::text, 'NHL'::text, 'NBA'::text, 'NCAAB'::text, 'Baseball'::text, 'WNBA'::text])));

alter table public.ruby_submissions add constraint "ruby_submissions_sportsbook_check" CHECK (((length(sportsbook) >= 1) AND (length(sportsbook) <= 80)));

alter table public.ruby_submissions add constraint "ruby_submissions_title_check" CHECK (((length(title) >= 1) AND (length(title) <= 90)));

alter table public.ruby_visibility_events add constraint "ruby_visibility_events_pkey" PRIMARY KEY (id);

alter table public.saved_legs add constraint "saved_legs_pkey" PRIMARY KEY (user_id, leg_key);

alter table public.sports_games add constraint "sports_games_payload_check" CHECK ((jsonb_typeof(payload) = 'object'::text));

alter table public.sports_games add constraint "sports_games_pkey" PRIMARY KEY (id);

alter table public.sports_games add constraint "sports_games_provider_id_check" CHECK ((provider_id ~ '^\d+$'::text));

alter table public.sports_games add constraint "sports_games_sport_check" CHECK ((sport = ANY (ARRAY['nhl'::text, 'ncaab'::text])));

alter table public.sports_games add constraint "sports_games_sport_provider_id_key" UNIQUE (sport, provider_id);

alter table public.sports_games add constraint "sports_games_sport_slug_key" UNIQUE (sport, slug);

alter table public.sports_markets add constraint "sports_markets_check" CHECK ((expires_at > observed_at));

alter table public.sports_markets add constraint "sports_markets_fingerprint_key" UNIQUE (fingerprint);

alter table public.sports_markets add constraint "sports_markets_pkey" PRIMARY KEY (id);

alter table public.sports_selections add constraint "sports_selections_classification_check" CHECK ((classification = 'QUALITATIVE_EDITORIAL'::text));

alter table public.sports_selections add constraint "sports_selections_market_id_key" UNIQUE (market_id);

alter table public.sports_selections add constraint "sports_selections_pkey" PRIMARY KEY (id);

alter table public.target_legs add constraint "target_legs_check" CHECK ((((status = 'OFFICIAL'::text) AND (official_pick_id IS NOT NULL) AND promoted_to_official) OR ((status <> 'OFFICIAL'::text) AND (official_pick_id IS NULL) AND (NOT promoted_to_official))));

alter table public.target_legs add constraint "target_legs_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (10)::numeric)));

alter table public.target_legs add constraint "target_legs_current_odds_check" CHECK ((abs(current_odds) >= (100)::numeric));

alter table public.target_legs add constraint "target_legs_market_probability_check" CHECK (((market_probability >= (0)::numeric) AND (market_probability <= (100)::numeric)));

alter table public.target_legs add constraint "target_legs_model_probability_check" CHECK (((model_probability >= (0)::numeric) AND (model_probability <= (100)::numeric)));

alter table public.target_legs add constraint "target_legs_pkey" PRIMARY KEY (id);

alter table public.target_legs add constraint "target_legs_rank_check" CHECK ((rank > 0));

alter table public.target_legs add constraint "target_legs_risk_check" CHECK (((risk >= (0)::numeric) AND (risk <= (10)::numeric)));

alter table public.target_legs add constraint "target_legs_status_check" CHECK ((status = ANY (ARRAY['WATCH'::text, 'INTEREST'::text, 'BETTABLE'::text, 'WAIT'::text, 'PRICE LOST'::text, 'INJURY DEPENDENT'::text, 'WEATHER DEPENDENT'::text, 'PASS'::text, 'OFFICIAL'::text])));

alter table public.topic_follows add constraint "topic_follows_kind_check" CHECK ((kind = ANY (ARRAY['team'::text, 'player'::text])));

alter table public.topic_follows add constraint "topic_follows_pkey" PRIMARY KEY (user_id, kind, topic);

alter table public.topic_follows add constraint "topic_follows_topic_check" CHECK (((length(topic) >= 2) AND (length(topic) <= 80)));

alter table public.alert_preferences add constraint "alert_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.app_update_reads add constraint "app_update_reads_update_id_fkey" FOREIGN KEY (update_id) REFERENCES app_updates(id) ON DELETE CASCADE;

alter table public.app_update_reads add constraint "app_update_reads_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.bankroll_transactions add constraint "bankroll_transactions_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);

alter table public.bankroll_transactions add constraint "bankroll_transactions_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table public.candidate_releases add constraint "candidate_releases_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES challenge_stages(id);

alter table public.challenge_checkins add constraint "challenge_checkins_user_id_challenge_id_fkey" FOREIGN KEY (user_id, challenge_id) REFERENCES challenge_runs(user_id, challenge_id);

alter table public.challenge_runs add constraint "challenge_runs_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);

alter table public.challenge_runs add constraint "challenge_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.challenge_stages add constraint "challenge_stages_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);

alter table public.challenge_stages add constraint "challenge_stages_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table public.closing_lines add constraint "closing_lines_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table public.community_comment_reactions add constraint "community_comment_reactions_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_post_comments(id) ON DELETE CASCADE;

alter table public.community_comment_reactions add constraint "community_comment_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_poll_votes add constraint "community_poll_votes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_polls(post_id) ON DELETE CASCADE;

alter table public.community_poll_votes add constraint "community_poll_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_polls add constraint "community_polls_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_post_comments add constraint "community_post_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES community_post_comments(id) ON DELETE SET NULL;

alter table public.community_post_comments add constraint "community_post_comments_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_post_comments add constraint "community_post_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_post_votes add constraint "community_post_votes_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_post_votes add constraint "community_post_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_posts add constraint "community_posts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_profiles add constraint "community_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.community_reactions add constraint "community_reactions_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_reactions add constraint "community_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_reports add constraint "community_reports_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_reports add constraint "community_reports_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.community_shares add constraint "community_shares_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.community_shares add constraint "community_shares_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.edge_releases add constraint "edge_releases_official_pick_id_fkey" FOREIGN KEY (official_pick_id) REFERENCES official_picks(id);

alter table public.intelligence_markets add constraint "intelligence_markets_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table public.intelligence_markets add constraint "intelligence_markets_official_pick_id_fkey" FOREIGN KEY (official_pick_id) REFERENCES official_picks(id);

alter table public.intelligence_models add constraint "intelligence_models_market_id_fkey" FOREIGN KEY (market_id) REFERENCES intelligence_markets(id);

alter table public.intelligence_news add constraint "intelligence_news_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table public.intelligence_quotes add constraint "intelligence_quotes_market_id_fkey" FOREIGN KEY (market_id) REFERENCES intelligence_markets(id);

alter table public.leg_book_prices add constraint "leg_book_prices_leg_key_fkey" FOREIGN KEY (leg_key) REFERENCES private.leg_result_contracts(leg_key);

alter table public.leg_history add constraint "leg_history_leg_key_fkey" FOREIGN KEY (leg_key) REFERENCES private.leg_result_contracts(leg_key);

alter table public.leg_market_prices add constraint "leg_market_prices_leg_key_fkey" FOREIGN KEY (leg_key) REFERENCES private.leg_result_contracts(leg_key);

alter table public.leg_result_progress add constraint "leg_result_progress_leg_key_fkey" FOREIGN KEY (leg_key) REFERENCES private.leg_result_contracts(leg_key);

alter table public.leg_tails add constraint "leg_tails_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.member_blocks add constraint "member_blocks_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.member_blocks add constraint "member_blocks_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.member_follows add constraint "member_follows_target_user_id_fkey" FOREIGN KEY (target_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.member_follows add constraint "member_follows_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.member_parlays add constraint "member_parlays_community_post_id_fkey" FOREIGN KEY (community_post_id) REFERENCES community_posts(id) ON DELETE SET NULL;

alter table public.member_parlays add constraint "member_parlays_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_games(id);

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_quote_observation_id_fkey" FOREIGN KEY (quote_observation_id) REFERENCES nba_observations(id);

alter table public.nba_editorial_picks add constraint "nba_editorial_picks_supersedes_id_fkey" FOREIGN KEY (supersedes_id) REFERENCES nba_editorial_picks(id);

alter table public.nba_game_results add constraint "nba_game_results_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_games(id);

alter table public.nba_player_results add constraint "nba_player_results_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_game_results(game_id);

alter table public.nba_player_shooting add constraint "nba_player_shooting_game_id_athlete_id_fkey" FOREIGN KEY (game_id, athlete_id) REFERENCES nba_player_results(game_id, athlete_id);

alter table public.nba_player_three_attempts add constraint "nba_player_three_attempts_game_id_athlete_id_fkey" FOREIGN KEY (game_id, athlete_id) REFERENCES nba_player_results(game_id, athlete_id);

alter table public.nba_result_progress add constraint "nba_result_progress_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_games(id);

alter table public.nfl_analyst_double_ups add constraint "nfl_analyst_double_ups_quote_observation_id_fkey" FOREIGN KEY (quote_observation_id) REFERENCES source_observations(id);

alter table public.notification_preferences add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notifications add constraint "notifications_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.notifications add constraint "notifications_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES community_post_comments(id) ON DELETE CASCADE;

alter table public.notifications add constraint "notifications_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.notifications add constraint "notifications_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.official_picks add constraint "official_picks_analysis_id_fkey" FOREIGN KEY (analysis_id) REFERENCES analysis_versions(id);

alter table public.official_picks add constraint "official_picks_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table public.official_picks add constraint "official_picks_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES challenge_stages(id);

alter table public.onboarding_events add constraint "onboarding_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.personal_challenges add constraint "personal_challenges_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES challenges(id);

alter table public.personal_challenges add constraint "personal_challenges_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_admin_id_fkey" FOREIGN KEY (admin_id) REFERENCES auth.users(id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES personal_entries(id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_request_id_fkey" FOREIGN KEY (request_id) REFERENCES personal_correction_requests(id);

alter table public.personal_correction_decisions add constraint "personal_correction_decisions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.personal_correction_requests add constraint "personal_correction_requests_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES personal_entries(id);

alter table public.personal_correction_requests add constraint "personal_correction_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.personal_entries add constraint "personal_entries_personal_challenge_id_fkey" FOREIGN KEY (personal_challenge_id) REFERENCES personal_challenges(id);

alter table public.personal_entries add constraint "personal_entries_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table public.personal_entries add constraint "personal_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.personal_run_events add constraint "personal_run_events_personal_challenge_id_fkey" FOREIGN KEY (personal_challenge_id) REFERENCES personal_challenges(id);

alter table public.personal_run_events add constraint "personal_run_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.personal_settlements add constraint "personal_settlements_entry_id_fkey" FOREIGN KEY (entry_id) REFERENCES personal_entries(id);

alter table public.personal_settlements add constraint "personal_settlements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table public.pick_entries add constraint "pick_entries_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table public.pick_results add constraint "pick_results_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table private.account_erasure_jobs add constraint "account_erasure_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.admin_users add constraint "admin_users_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table private.community_restrictions add constraint "community_restrictions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.leg_result_contracts add constraint "leg_result_contracts_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table private.leg_result_evidence add constraint "leg_result_evidence_leg_key_fkey" FOREIGN KEY (leg_key) REFERENCES private.leg_result_contracts(leg_key);

alter table private.live_pick_alerts add constraint "live_pick_alerts_zone_post_id_fkey" FOREIGN KEY (zone_post_id) REFERENCES community_posts(id) ON DELETE SET NULL;

alter table private.memberships add constraint "memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id);

alter table private.nba_result_corrections add constraint "nba_result_corrections_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_game_results(game_id);

alter table private.nba_result_staging add constraint "nba_result_staging_game_id_fkey" FOREIGN KEY (game_id) REFERENCES nba_games(id);

alter table private.nba_threes_posts add constraint "nba_threes_posts_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE SET NULL;

alter table private.nfl_selection_gate_decisions add constraint "nfl_selection_gate_decisions_version_fkey" FOREIGN KEY (version) REFERENCES private.nfl_selection_rule_versions(version);

alter table private.nhl_chart_snapshots add constraint "nhl_chart_snapshots_game_id_fkey" FOREIGN KEY (game_id) REFERENCES sports_games(id);

alter table private.notification_action_rates add constraint "notification_action_rates_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.notification_events add constraint "notification_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.notification_events add constraint "notification_events_notification_id_fkey" FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL;

alter table private.notification_events add constraint "notification_events_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.notification_presence add constraint "notification_presence_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table private.weekly_sleeper_reviews add constraint "weekly_sleeper_reviews_release_id_fkey" FOREIGN KEY (release_id) REFERENCES candidate_releases(id);

alter table private.zone_post_games add constraint "zone_post_games_post_id_fkey" FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;

alter table public.process_reviews add constraint "process_reviews_pick_id_fkey" FOREIGN KEY (pick_id) REFERENCES official_picks(id);

alter table public.ruby_card_comments add constraint "ruby_card_comments_card_id_fkey" FOREIGN KEY (card_id) REFERENCES ruby_submissions(id) ON DELETE CASCADE;

alter table public.ruby_card_comments add constraint "ruby_card_comments_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES ruby_card_comments(id) ON DELETE SET NULL;

alter table public.ruby_card_comments add constraint "ruby_card_comments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_edited_by_fkey" FOREIGN KEY (edited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.ruby_card_revisions add constraint "ruby_card_revisions_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES ruby_submissions(id) ON DELETE CASCADE;

alter table public.ruby_contributors add constraint "ruby_contributors_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.ruby_daily_features add constraint "ruby_daily_features_analyst_ticket_id_fkey" FOREIGN KEY (analyst_ticket_id) REFERENCES nfl_analyst_double_ups(id);

alter table public.ruby_daily_features add constraint "ruby_daily_features_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES ruby_submissions(id) ON DELETE CASCADE;

alter table public.ruby_daily_features add constraint "ruby_daily_features_verified_by_fkey" FOREIGN KEY (verified_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.ruby_result_reports add constraint "ruby_result_reports_reported_by_fkey" FOREIGN KEY (reported_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.ruby_result_reports add constraint "ruby_result_reports_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES ruby_submissions(id) ON DELETE CASCADE;

alter table public.ruby_submissions add constraint "ruby_submissions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES ruby_contributors(user_id) ON DELETE CASCADE;

alter table public.ruby_visibility_events add constraint "ruby_visibility_events_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table public.ruby_visibility_events add constraint "ruby_visibility_events_submission_id_fkey" FOREIGN KEY (submission_id) REFERENCES ruby_submissions(id) ON DELETE CASCADE;

alter table public.saved_legs add constraint "saved_legs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.sports_markets add constraint "sports_markets_game_id_fkey" FOREIGN KEY (game_id) REFERENCES sports_games(id);

alter table public.sports_markets add constraint "sports_markets_source_id_fkey" FOREIGN KEY (source_id) REFERENCES private.sports_sources(id);

alter table public.sports_selections add constraint "sports_selections_author_id_fkey" FOREIGN KEY (author_id) REFERENCES auth.users(id);

alter table public.sports_selections add constraint "sports_selections_game_id_fkey" FOREIGN KEY (game_id) REFERENCES sports_games(id);

alter table public.sports_selections add constraint "sports_selections_market_id_fkey" FOREIGN KEY (market_id) REFERENCES sports_markets(id);

alter table public.target_legs add constraint "target_legs_analysis_version_id_fkey" FOREIGN KEY (analysis_version_id) REFERENCES analysis_versions(id);

alter table public.target_legs add constraint "target_legs_game_id_fkey" FOREIGN KEY (game_id) REFERENCES games(id);

alter table public.target_legs add constraint "target_legs_official_pick_id_fkey" FOREIGN KEY (official_pick_id) REFERENCES official_picks(id);

alter table public.topic_follows add constraint "topic_follows_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX audit_entity_idx ON public.audit_events USING btree (entity_id, created_at);

CREATE INDEX transactions_challenge_idx ON public.bankroll_transactions USING btree (challenge_id, created_at);

CREATE INDEX candidate_releases_stage_latest ON public.candidate_releases USING btree (stage_id, created_at DESC);

CREATE INDEX challenge_runs_count ON public.challenge_runs USING btree (challenge_id) WHERE count_me;

CREATE INDEX stages_game_idx ON public.challenge_stages USING btree (game_id);

CREATE INDEX comment_reaction_user ON public.community_comment_reactions USING btree (user_id);

CREATE INDEX community_comment_parent ON public.community_post_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX community_comments_post ON public.community_post_comments USING btree (post_id, created_at);

CREATE INDEX community_comments_user ON public.community_post_comments USING btree (user_id, created_at DESC);

CREATE INDEX community_post_votes_post ON public.community_post_votes USING btree (post_id);

CREATE UNIQUE INDEX community_photo_path_unique ON public.community_posts USING btree (photo_path) WHERE (photo_path IS NOT NULL);

CREATE INDEX community_posts_author ON public.community_posts USING btree (user_id, created_at DESC);

CREATE INDEX community_posts_latest ON public.community_posts USING btree (sport, created_at DESC);

CREATE UNIQUE INDEX community_username_unique ON public.community_profiles USING btree (lower(username));

CREATE INDEX community_reactions_user ON public.community_reactions USING btree (user_id);

CREATE INDEX community_share_user ON public.community_shares USING btree (user_id);

CREATE INDEX edge_releases_newest ON public.edge_releases USING btree (created_at DESC);

CREATE INDEX intelligence_models_tape ON public.intelligence_models USING btree (market_id, observed_at DESC, id DESC);

CREATE INDEX intelligence_news_tape ON public.intelligence_news USING btree (game_id, observed_at DESC, id DESC);

CREATE INDEX intelligence_quotes_book ON public.intelligence_quotes USING btree (market_id, book, observed_at DESC);

CREATE INDEX intelligence_quotes_tape ON public.intelligence_quotes USING btree (market_id, observed_at DESC, id DESC);

CREATE INDEX leg_tails_leg ON public.leg_tails USING btree (leg_key);

CREATE INDEX member_parlays_owner ON public.member_parlays USING btree (user_id, created_at DESC);

CREATE UNIQUE INDEX nba_editorial_one_original ON public.nba_editorial_picks USING btree (game_id, player, market) WHERE (supersedes_id IS NULL);

CREATE UNIQUE INDEX nba_editorial_one_successor ON public.nba_editorial_picks USING btree (supersedes_id) WHERE (supersedes_id IS NOT NULL);

CREATE INDEX nba_editorial_picks_recent ON public.nba_editorial_picks USING btree (published_at DESC);

CREATE INDEX nba_player_results_name_idx ON public.nba_player_results USING btree (game_id, name_key);

CREATE INDEX nfl_analyst_double_up_quote ON public.nfl_analyst_double_ups USING btree (quote_observation_id);

CREATE INDEX notification_actor ON public.notifications USING btree (actor_id) WHERE (actor_id IS NOT NULL);

CREATE INDEX notification_comment ON public.notifications USING btree (comment_id) WHERE (comment_id IS NOT NULL);

CREATE INDEX notification_inbox ON public.notifications USING btree (recipient_id, updated_at DESC, id DESC);

CREATE INDEX notification_post ON public.notifications USING btree (post_id) WHERE (post_id IS NOT NULL);

CREATE INDEX notification_search ON public.notifications USING gin (to_tsvector('simple'::regconfig, private.notification_search_document(actor_name, actor_names, message)));

CREATE INDEX notification_unread ON public.notifications USING btree (recipient_id, updated_at DESC) WHERE (read_at IS NULL);

CREATE INDEX picks_analysis_idx ON public.official_picks USING btree (analysis_id);

CREATE INDEX picks_game_idx ON public.official_picks USING btree (game_id);

CREATE INDEX personal_challenges_challenge_idx ON public.personal_challenges USING btree (challenge_id);

CREATE INDEX correction_decisions_admin_idx ON public.personal_correction_decisions USING btree (admin_id);

CREATE INDEX correction_decisions_entry_idx ON public.personal_correction_decisions USING btree (entry_id, sequence DESC);

CREATE INDEX correction_decisions_user_idx ON public.personal_correction_decisions USING btree (user_id);

CREATE INDEX correction_requests_entry_idx ON public.personal_correction_requests USING btree (entry_id, created_at DESC);

CREATE INDEX correction_requests_user_idx ON public.personal_correction_requests USING btree (user_id);

CREATE INDEX personal_entries_account_idx ON public.personal_entries USING btree (personal_challenge_id);

CREATE INDEX personal_entries_pick_idx ON public.personal_entries USING btree (pick_id);

CREATE INDEX personal_run_events_latest ON public.personal_run_events USING btree (personal_challenge_id, id DESC);

CREATE INDEX personal_settlements_user_idx ON public.personal_settlements USING btree (user_id);

CREATE INDEX live_pick_alert_zone_post ON private.live_pick_alerts USING btree (zone_post_id) WHERE (zone_post_id IS NOT NULL);

CREATE INDEX live_pick_zone_due ON private.live_pick_alerts USING btree (zone_next_attempt_at, pick_id) WHERE (zone_status = 'pending'::text);

CREATE INDEX memberships_user_idx ON private.memberships USING btree (user_id, expires_at);

CREATE INDEX notification_event_projection ON private.notification_events USING btree (notification_id) WHERE (notification_id IS NOT NULL);

CREATE INDEX notification_event_rate ON private.notification_events USING btree (actor_id, recipient_id, created_at DESC);

CREATE INDEX notification_presence_active ON private.notification_presence USING btree (user_id, last_seen DESC) WHERE visible;

CREATE INDEX zone_post_games_game ON private.zone_post_games USING btree (sport, game_id);

CREATE INDEX reviews_pick_idx ON public.process_reviews USING btree (pick_id, created_at DESC);

CREATE INDEX ruby_card_comments_card ON public.ruby_card_comments USING btree (card_id, created_at DESC);

CREATE INDEX ruby_card_comments_parent ON public.ruby_card_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX ruby_card_comments_user ON public.ruby_card_comments USING btree (user_id, created_at DESC);

CREATE INDEX ruby_feature_analyst_ticket ON public.ruby_daily_features USING btree (analyst_ticket_id);

CREATE INDEX ruby_feature_submission ON public.ruby_daily_features USING btree (submission_id);

CREATE INDEX ruby_feature_verifier ON public.ruby_daily_features USING btree (verified_by);

CREATE INDEX ruby_reports_latest ON public.ruby_result_reports USING btree (submission_id, reported_at DESC, id DESC);

CREATE INDEX ruby_submissions_recent ON public.ruby_submissions USING btree (created_at DESC, id);

CREATE INDEX ruby_submissions_user_day ON public.ruby_submissions USING btree (user_id, submission_day);

CREATE INDEX ruby_visibility_latest ON public.ruby_visibility_events USING btree (submission_id, created_at DESC, id DESC);

CREATE INDEX sports_games_slate ON public.sports_games USING btree (sport, start_time);

CREATE INDEX sports_markets_game ON public.sports_markets USING btree (game_id, observed_at DESC);

CREATE INDEX sports_markets_game_market_latest ON public.sports_markets USING btree (game_id, ((payload ->> 'market'::text)), observed_at DESC);

CREATE INDEX target_legs_game_id_analysis_version_id_idx ON public.target_legs USING btree (game_id, analysis_version_id);

CREATE INDEX target_official_idx ON public.target_legs USING btree (official_pick_id);

CREATE INDEX topic_follows_match ON public.topic_follows USING btree (kind, topic);

grant execute on function private.community_activity() to authenticated;

grant execute on function private.community_follow_target_allowed(uuid) to authenticated;

grant execute on function private.community_member_allowed(uuid) to authenticated;

grant execute on function private.community_photo_access() to authenticated;

grant execute on function private.create_member_parlay(text,text[]) to authenticated;

grant execute on function private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) to authenticated;

grant execute on function private.feature_ruby(uuid,integer,text,text,timestamp with time zone) to authenticated;

grant execute on function private.free_challenge_desk() to authenticated;

grant execute on function private.is_admin() to authenticated;

grant execute on function private.is_research_release(jsonb) to service_role;

grant execute on function private.is_weekly_sleeper(jsonb) to service_role;

grant execute on function private.leg_tail_counts(text[]) to authenticated,service_role;

grant execute on function private.notification_follow_inbox_allowed(uuid,uuid,uuid,text) to authenticated;

grant execute on function private.notification_pulse(uuid,boolean) to authenticated;

grant execute on function private.notification_search_document(text,text[],text) to authenticated;

grant execute on function private.public_overview() to authenticated;

grant execute on function private.publish(text,jsonb,uuid) to authenticated;

grant execute on function private.published_leg_recommendation(text) to authenticated;

grant execute on function private.recent_ruby_card_comment() to authenticated;

grant execute on function private.ruby_home() to authenticated;

grant execute on function private.ruby_visible(uuid) to authenticated;

grant execute on function private.set_community_poll_vote(uuid,integer) to authenticated;

grant execute on function private.set_community_post_vote(uuid,integer) to authenticated;

grant execute on function private.set_community_reaction(uuid,text) to authenticated;

grant execute on function private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer) to authenticated;

grant execute on function private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) to authenticated;

grant execute on function public.add_ruby_card_comment(uuid,text,uuid) to authenticated;

grant execute on function public.community_activity() to authenticated;

grant execute on function public.community_avatars(uuid[]) to authenticated;

grant execute on function public.community_comments(uuid,uuid) to authenticated;

grant execute on function public.community_feed(text,integer,boolean) to authenticated;

grant execute on function public.community_poll_states(uuid[]) to authenticated;

grant execute on function public.community_post(uuid) to authenticated;

grant execute on function public.community_profile(text,integer) to authenticated;

grant execute on function public.community_reaction_state(uuid) to authenticated;

grant execute on function public.community_story_clock() to authenticated;

grant execute on function public.community_vote_states(uuid[]) to authenticated;

grant execute on function public.create_community_poll_post(uuid,text,text,text,text,jsonb) to authenticated;

grant execute on function public.create_member_parlay(text,text[]) to authenticated;

grant execute on function public.delete_ruby_card_comment(uuid) to authenticated;

grant execute on function public.desk_data() to authenticated;

grant execute on function public.desk_data_compact() to authenticated,service_role;

grant execute on function public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text) to authenticated;

grant execute on function public.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text) to authenticated;

grant execute on function public.feature_ruby(uuid,integer,text,text,timestamp with time zone) to authenticated;

grant execute on function public.is_admin() to authenticated;

grant execute on function public.leg_tail_counts(text[]) to authenticated,service_role;

grant execute on function public.nba_name_key(text) to authenticated,service_role;

grant execute on function public.nba_player_usage(text[]) to authenticated,service_role;

grant execute on function public.notification_action(text,uuid,timestamp with time zone) to authenticated;

grant execute on function public.notification_counts() to authenticated;

grant execute on function public.notification_inbox(text,text,boolean,timestamp with time zone,uuid) to authenticated;

grant execute on function public.notification_pulse(uuid,boolean) to authenticated;

grant execute on function public.notification_view(uuid[],timestamp with time zone) to authenticated;

grant execute on function public.published_leg_catalog(timestamp with time zone) to authenticated;

grant execute on function public.restrict_community_member(uuid,text,boolean) to authenticated;

grant execute on function public.ruby_card_comment_counts(uuid[]) to authenticated;

grant execute on function public.ruby_card_comments(uuid) to authenticated;

grant execute on function public.ruby_home() to authenticated;

grant execute on function public.set_community_poll_vote(uuid,integer) to authenticated;

grant execute on function public.set_community_post_vote(uuid,integer) to authenticated;

grant execute on function public.set_community_reaction(uuid,text) to authenticated;

grant execute on function public.share_member_parlay(uuid) to authenticated;

grant execute on function public.submit_ruby(uuid,text,text,jsonb,text,text,text,integer) to authenticated;

grant execute on function public.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text) to authenticated;

alter table public.alert_preferences enable row level security;

create policy "age_verified_account" on public.alert_preferences as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_delete" on public.alert_preferences as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_insert" on public.alert_preferences as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_read" on public.alert_preferences as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_update" on public.alert_preferences as PERMISSIVE for UPDATE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

grant INSERT,SELECT,UPDATE,DELETE on public.alert_preferences to authenticated;

alter table public.app_update_reads enable row level security;

create policy "age_verified_account" on public.app_update_reads as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_delete" on public.app_update_reads as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_insert" on public.app_update_reads as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_read" on public.app_update_reads as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

grant INSERT,SELECT,DELETE on public.app_update_reads to authenticated;

alter table public.app_updates enable row level security;

create policy "age_verified_account" on public.app_updates as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "update_publish" on public.app_updates as PERMISSIVE for INSERT to "authenticated" with check (( SELECT is_admin() AS is_admin));

create policy "update_read" on public.app_updates as PERMISSIVE for SELECT to "authenticated" using (true);

grant INSERT,SELECT on public.app_updates to authenticated;

alter table public.audit_events enable row level security;

create policy "age_verified_account" on public.audit_events as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.audit_events as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.audit_events to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.bankroll_transactions enable row level security;

create policy "age_verified_account" on public.bankroll_transactions as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.bankroll_transactions as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.bankroll_transactions to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.bankroll_transactions FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.bankroll_transactions FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.candidate_releases enable row level security;

create policy "age_verified_account" on public.candidate_releases as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_research_read" on public.candidate_releases as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.candidate_releases to authenticated;

grant INSERT,SELECT on public.candidate_releases to service_role;

CREATE TRIGGER enforce_nfl_selection_gate BEFORE INSERT ON public.candidate_releases FOR EACH ROW WHEN (((NOT private.is_research_release(new.candidates)) AND (NOT COALESCE(private.is_weekly_sleeper(new.candidates), false)))) EXECUTE FUNCTION private.enforce_nfl_selection_gate();

CREATE TRIGGER enforce_research_board BEFORE INSERT ON public.candidate_releases FOR EACH ROW WHEN (private.is_research_release(new.candidates)) EXECUTE FUNCTION private.enforce_research_board();

CREATE TRIGGER enforce_weekly_sleeper AFTER INSERT ON public.candidate_releases FOR EACH ROW WHEN (private.is_weekly_sleeper(new.candidates)) EXECUTE FUNCTION private.enforce_weekly_sleeper();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.candidate_releases FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.challenge_checkins enable row level security;

create policy "age_verified_account" on public.challenge_checkins as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_checkins" on public.challenge_checkins as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

grant SELECT on public.challenge_checkins to authenticated;

CREATE TRIGGER checkins_immutable BEFORE DELETE OR UPDATE ON public.challenge_checkins FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

alter table public.challenge_runs enable row level security;

create policy "age_verified_account" on public.challenge_runs as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_run" on public.challenge_runs as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT private.is_admin() AS is_admin)));

grant SELECT on public.challenge_runs to authenticated;

alter table public.challenge_stages enable row level security;

create policy "age_verified_account" on public.challenge_stages as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.challenge_stages as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.challenge_stages to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.challenge_stages FOR EACH ROW EXECUTE FUNCTION private.audit_change();

alter table public.challenges enable row level security;

create policy "age_verified_account" on public.challenges as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.challenges as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.challenges to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.challenges FOR EACH ROW EXECUTE FUNCTION private.audit_change();

alter table public.closing_lines enable row level security;

create policy "age_verified_account" on public.closing_lines as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.closing_lines as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.closing_lines to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.closing_lines FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.closing_lines FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.community_comment_reactions enable row level security;

create policy "comment_reaction_delete" on public.community_comment_reactions as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "comment_reaction_insert" on public.community_comment_reactions as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.age_member_allowed() AND (EXISTS ( SELECT 1
   FROM community_post_comments c
  WHERE ((c.id = community_comment_reactions.comment_id) AND private.community_member_allowed(c.user_id))))));

create policy "comment_reaction_read" on public.community_comment_reactions as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM community_post_comments c
  WHERE (c.id = community_comment_reactions.comment_id))));

grant INSERT,SELECT,DELETE on public.community_comment_reactions to authenticated;

CREATE TRIGGER notification_reaction_rate BEFORE INSERT ON public.community_comment_reactions FOR EACH ROW EXECUTE FUNCTION private.notification_interaction_guard();

alter table public.community_poll_votes enable row level security;

alter table public.community_polls enable row level security;

create policy "community_polls_insert" on public.community_polls as PERMISSIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM community_posts p
  WHERE ((p.id = community_polls.post_id) AND (p.user_id = ( SELECT auth.uid() AS uid)) AND (p.created_at > (now() - '00:01:00'::interval))))));

create policy "community_polls_read" on public.community_polls as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM community_posts p
  WHERE ((p.id = community_polls.post_id) AND (private.community_member_allowed(p.user_id) OR ( SELECT is_admin() AS is_admin))))));

grant INSERT,SELECT on public.community_polls to authenticated;

CREATE TRIGGER guard_community_poll BEFORE INSERT ON public.community_polls FOR EACH ROW EXECUTE FUNCTION private.guard_community_poll();

alter table public.community_post_comments enable row level security;

create policy "age_verified_account" on public.community_post_comments as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "community_comments_delete" on public.community_post_comments as PERMISSIVE for DELETE to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

create policy "community_comments_insert" on public.community_post_comments as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "community_comments_read" on public.community_post_comments as PERMISSIVE for SELECT to "authenticated" using ((private.community_member_allowed(user_id) OR ( SELECT is_admin() AS is_admin)));

grant INSERT,SELECT,DELETE on public.community_post_comments to authenticated;

CREATE TRIGGER safety_comment BEFORE INSERT ON public.community_post_comments FOR EACH ROW EXECUTE FUNCTION private.community_safety_check();

alter table public.community_post_votes enable row level security;

alter table public.community_posts enable row level security;

create policy "age_verified_account" on public.community_posts as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "community_posts_delete" on public.community_posts as PERMISSIVE for DELETE to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

create policy "community_posts_insert" on public.community_posts as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "community_posts_read" on public.community_posts as PERMISSIVE for SELECT to "authenticated" using ((private.community_member_allowed(user_id) OR ( SELECT is_admin() AS is_admin)));

grant INSERT,SELECT,DELETE on public.community_posts to authenticated;

CREATE TRIGGER safety_post BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION private.community_safety_check();

alter table public.community_profiles enable row level security;

create policy "age_verified_account" on public.community_profiles as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_profile_insert" on public.community_profiles as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "own_profile_read" on public.community_profiles as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "own_profile_update" on public.community_profiles as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

grant INSERT,SELECT,UPDATE on public.community_profiles to authenticated;

CREATE TRIGGER guard_community_profile_text BEFORE INSERT OR UPDATE OF tagline, bio ON public.community_profiles FOR EACH ROW EXECUTE FUNCTION private.guard_community_profile_text();

CREATE TRIGGER profile_onboarding AFTER INSERT OR UPDATE ON public.community_profiles FOR EACH ROW EXECUTE FUNCTION private.record_onboarding();

alter table public.community_reactions enable row level security;

create policy "age_verified_account" on public.community_reactions as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "community_reactions_delete" on public.community_reactions as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "community_reactions_insert" on public.community_reactions as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "community_reactions_read" on public.community_reactions as PERMISSIVE for SELECT to "authenticated" using (true);

grant INSERT,SELECT,DELETE on public.community_reactions to authenticated;

CREATE TRIGGER a_guard_community_typed_reaction BEFORE INSERT ON public.community_reactions FOR EACH ROW EXECUTE FUNCTION private.guard_community_typed_reaction();

CREATE TRIGGER notification_like_rate BEFORE INSERT ON public.community_reactions FOR EACH ROW EXECUTE FUNCTION private.notification_interaction_guard();

CREATE TRIGGER safety_reaction BEFORE INSERT ON public.community_reactions FOR EACH ROW EXECUTE FUNCTION private.community_safety_check();

alter table public.community_reports enable row level security;

create policy "age_verified_account" on public.community_reports as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "community_reports_insert" on public.community_reports as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "community_reports_read" on public.community_reports as PERMISSIVE for SELECT to "authenticated" using (((user_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)));

grant INSERT,SELECT on public.community_reports to authenticated;

CREATE TRIGGER safety_report BEFORE INSERT ON public.community_reports FOR EACH ROW EXECUTE FUNCTION private.community_safety_check();

alter table public.community_shares enable row level security;

create policy "community_share_insert" on public.community_shares as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND private.age_member_allowed() AND (EXISTS ( SELECT 1
   FROM community_posts p
  WHERE ((p.id = community_shares.post_id) AND private.community_member_allowed(p.user_id))))));

grant INSERT on public.community_shares to authenticated;

CREATE TRIGGER notification_share_rate BEFORE INSERT ON public.community_shares FOR EACH ROW EXECUTE FUNCTION private.notification_interaction_guard();

alter table public.edge_releases enable row level security;

create policy "age_verified_account" on public.edge_releases as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.edge_releases as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.edge_releases to authenticated;

CREATE TRIGGER audit_change AFTER INSERT ON public.edge_releases FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER guard_nfl_edge_release BEFORE INSERT ON public.edge_releases FOR EACH ROW EXECUTE FUNCTION private.guard_nfl_edge_release();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.edge_releases FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.intelligence_markets enable row level security;

create policy "age_verified_account" on public.intelligence_markets as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "verified_admin_append" on public.intelligence_markets as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.is_admin() AS is_admin) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy "verified_admin_read" on public.intelligence_markets as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_admin() AS is_admin));

grant INSERT,SELECT on public.intelligence_markets to authenticated;

CREATE TRIGGER intelligence_immutable BEFORE DELETE OR UPDATE ON public.intelligence_markets FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER intelligence_stamp BEFORE INSERT ON public.intelligence_markets FOR EACH ROW EXECUTE FUNCTION private.stamp_intelligence();

alter table public.intelligence_models enable row level security;

create policy "age_verified_account" on public.intelligence_models as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "verified_admin_append" on public.intelligence_models as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.is_admin() AS is_admin) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy "verified_admin_read" on public.intelligence_models as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_admin() AS is_admin));

grant INSERT,SELECT on public.intelligence_models to authenticated;

CREATE TRIGGER intelligence_immutable BEFORE DELETE OR UPDATE ON public.intelligence_models FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER intelligence_stamp BEFORE INSERT ON public.intelligence_models FOR EACH ROW EXECUTE FUNCTION private.stamp_intelligence();

alter table public.intelligence_news enable row level security;

create policy "age_verified_account" on public.intelligence_news as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "verified_admin_append" on public.intelligence_news as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.is_admin() AS is_admin) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy "verified_admin_read" on public.intelligence_news as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_admin() AS is_admin));

grant INSERT,SELECT on public.intelligence_news to authenticated;

CREATE TRIGGER intelligence_immutable BEFORE DELETE OR UPDATE ON public.intelligence_news FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER intelligence_stamp BEFORE INSERT ON public.intelligence_news FOR EACH ROW EXECUTE FUNCTION private.stamp_intelligence();

alter table public.intelligence_quotes enable row level security;

create policy "age_verified_account" on public.intelligence_quotes as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "verified_admin_append" on public.intelligence_quotes as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT private.is_admin() AS is_admin) AND (created_by = ( SELECT auth.uid() AS uid))));

create policy "verified_admin_read" on public.intelligence_quotes as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.is_admin() AS is_admin));

grant INSERT,SELECT on public.intelligence_quotes to authenticated;

CREATE TRIGGER intelligence_immutable BEFORE DELETE OR UPDATE ON public.intelligence_quotes FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER intelligence_stamp BEFORE INSERT ON public.intelligence_quotes FOR EACH ROW EXECUTE FUNCTION private.stamp_intelligence();

alter table public.leg_book_prices enable row level security;

create policy "leg_book_prices_read" on public.leg_book_prices as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.has_membership() AS has_membership) AND ( SELECT private.age_member_allowed() AS age_member_allowed)));

grant SELECT on public.leg_book_prices to authenticated;

grant INSERT,SELECT,UPDATE,DELETE on public.leg_book_prices to service_role;

alter table public.leg_history enable row level security;

create policy "leg_history_read" on public.leg_history as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.has_membership() AS has_membership) AND ( SELECT private.age_member_allowed() AS age_member_allowed)));

grant SELECT on public.leg_history to authenticated;

grant INSERT,SELECT on public.leg_history to service_role;

alter table public.leg_market_prices enable row level security;

create policy "market_price_read" on public.leg_market_prices as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.has_membership() AS has_membership) AND ( SELECT private.age_member_allowed() AS age_member_allowed)));

grant SELECT on public.leg_market_prices to authenticated;

grant INSERT,SELECT,UPDATE on public.leg_market_prices to service_role;

CREATE TRIGGER keep_first_market_price BEFORE UPDATE ON public.leg_market_prices FOR EACH ROW EXECUTE FUNCTION private.keep_first_market_price();

alter table public.leg_result_progress enable row level security;

create policy "progress_read" on public.leg_result_progress as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.age_member_allowed() AS age_member_allowed) AND (( SELECT private.has_membership() AS has_membership) OR (EXISTS ( SELECT 1
   FROM leg_tails t
  WHERE ((t.leg_key = leg_result_progress.leg_key) AND (t.user_id = ( SELECT auth.uid() AS uid))))))));

grant SELECT on public.leg_result_progress to authenticated;

grant INSERT,SELECT,UPDATE on public.leg_result_progress to service_role;

alter table public.leg_tails enable row level security;

create policy "age_verified_account" on public.leg_tails as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_delete" on public.leg_tails as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_insert" on public.leg_tails as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_read" on public.leg_tails as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "retain_started_tails" on public.leg_tails as RESTRICTIVE for DELETE to "authenticated" using ((EXISTS ( SELECT 1
   FROM published_legs p
  WHERE ((p.leg_key = leg_tails.leg_key) AND (p.expires_at > now())))));

create policy "valid_tailed_leg" on public.leg_tails as RESTRICTIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM published_legs l
  WHERE ((l.leg_key = leg_tails.leg_key) AND (l.expires_at > now())))));

grant INSERT,SELECT,DELETE on public.leg_tails to authenticated;

alter table public.member_blocks enable row level security;

create policy "age_verified_account" on public.member_blocks as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_blocks_add" on public.member_blocks as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "member_blocks_read" on public.member_blocks as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "member_blocks_remove" on public.member_blocks as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant INSERT,SELECT,DELETE on public.member_blocks to authenticated;

CREATE TRIGGER notification_block_cleanup AFTER INSERT ON public.member_blocks FOR EACH ROW EXECUTE FUNCTION private.notification_block_cleanup();

alter table public.member_follows enable row level security;

create policy "age_verified_account" on public.member_follows as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_follows_delete" on public.member_follows as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "member_follows_insert" on public.member_follows as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (target_user_id <> ( SELECT auth.uid() AS uid)) AND ((EXISTS ( SELECT 1
   FROM community_posts p
  WHERE (p.user_id = member_follows.target_user_id))) OR private.community_follow_target_allowed(target_user_id))));

create policy "member_follows_read" on public.member_follows as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant INSERT,SELECT,DELETE on public.member_follows to authenticated;

CREATE TRIGGER notification_follow_rate BEFORE INSERT ON public.member_follows FOR EACH ROW EXECUTE FUNCTION private.notification_interaction_guard();

CREATE TRIGGER safety_follow BEFORE INSERT ON public.member_follows FOR EACH ROW EXECUTE FUNCTION private.community_safety_check();

alter table public.member_parlays enable row level security;

create policy "own_member_parlays_delete" on public.member_parlays as PERMISSIVE for DELETE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "own_member_parlays_read" on public.member_parlays as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT,DELETE on public.member_parlays to authenticated;

alter table public.nba_editorial_picks enable row level security;

create policy "age_verified_account" on public.nba_editorial_picks as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.nba_editorial_picks as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.nba_editorial_picks to authenticated;

grant INSERT,SELECT on public.nba_editorial_picks to service_role;

CREATE TRIGGER immutable_nba_editorial_pick BEFORE DELETE OR UPDATE ON public.nba_editorial_picks FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER validate_nba_editorial_pick BEFORE INSERT ON public.nba_editorial_picks FOR EACH ROW EXECUTE FUNCTION private.validate_nba_editorial_pick();

CREATE TRIGGER validate_nba_editorial_provenance BEFORE INSERT ON public.nba_editorial_picks FOR EACH ROW EXECUTE FUNCTION private.validate_nba_editorial_provenance();

CREATE TRIGGER validate_nba_editorial_quote_timeline BEFORE INSERT ON public.nba_editorial_picks FOR EACH ROW EXECUTE FUNCTION private.validate_nba_editorial_quote_timeline();

CREATE TRIGGER validate_nba_editorial_source_timeline BEFORE INSERT ON public.nba_editorial_picks FOR EACH ROW EXECUTE FUNCTION private.validate_nba_editorial_source_timeline();

alter table public.nba_game_results enable row level security;

create policy "age_verified_account" on public.nba_game_results as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.nba_game_results as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.nba_game_results to authenticated;

grant SELECT on public.nba_game_results to service_role;

CREATE TRIGGER immutable_nba_game_result BEFORE DELETE OR UPDATE ON public.nba_game_results FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.nba_player_results enable row level security;

create policy "age_verified_account" on public.nba_player_results as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.nba_player_results as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.nba_player_results to authenticated;

grant SELECT on public.nba_player_results to service_role;

CREATE TRIGGER immutable_nba_player_result BEFORE DELETE OR UPDATE ON public.nba_player_results FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.nba_player_shooting enable row level security;

create policy "age_verified_account" on public.nba_player_shooting as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.nba_player_shooting as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.nba_player_shooting to authenticated;

grant SELECT on public.nba_player_shooting to service_role;

CREATE TRIGGER immutable_nba_player_shooting BEFORE DELETE OR UPDATE ON public.nba_player_shooting FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.nba_player_three_attempts enable row level security;

create policy "age_verified_account" on public.nba_player_three_attempts as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.nba_player_three_attempts as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.nba_player_three_attempts to authenticated;

grant SELECT on public.nba_player_three_attempts to service_role;

CREATE TRIGGER immutable_nba_player_three_attempts BEFORE DELETE OR UPDATE ON public.nba_player_three_attempts FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.nba_result_progress enable row level security;

create policy "age_verified_account" on public.nba_result_progress as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.nba_result_progress as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.nba_result_progress to authenticated;

grant SELECT on public.nba_result_progress to service_role;

alter table public.nfl_analyst_double_ups enable row level security;

create policy "analyst_double_up_read" on public.nfl_analyst_double_ups as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.has_membership() AS has_membership) AND ( SELECT private.age_member_allowed() AS age_member_allowed)));

grant SELECT on public.nfl_analyst_double_ups to authenticated;

grant SELECT on public.nfl_analyst_double_ups to service_role;

CREATE TRIGGER immutable_analyst_double_up BEFORE DELETE OR UPDATE ON public.nfl_analyst_double_ups FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.notification_preferences enable row level security;

create policy "notification_pref_insert" on public.notification_preferences as PERMISSIVE for INSERT to "authenticated" with check ((user_id = ( SELECT auth.uid() AS uid)));

create policy "notification_pref_read" on public.notification_preferences as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

create policy "notification_pref_update" on public.notification_preferences as PERMISSIVE for UPDATE to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));

grant INSERT,SELECT,UPDATE on public.notification_preferences to authenticated;

CREATE TRIGGER notification_pref_guard BEFORE INSERT OR UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION private.notification_pref_guard();

alter table public.notifications enable row level security;

create policy "notification_follow_contract" on public.notifications as RESTRICTIVE for SELECT to "authenticated" using (private.notification_follow_inbox_allowed(id, recipient_id, actor_id, type));

create policy "notification_own_delete" on public.notifications as PERMISSIVE for DELETE to "authenticated" using ((recipient_id = ( SELECT auth.uid() AS uid)));

create policy "notification_own_read" on public.notifications as PERMISSIVE for SELECT to "authenticated" using (((recipient_id = ( SELECT auth.uid() AS uid)) AND ((actor_id IS NULL) OR (private.age_member_allowed() AND private.community_member_allowed(actor_id)))));

create policy "notification_own_update" on public.notifications as PERMISSIVE for UPDATE to "authenticated" using ((recipient_id = ( SELECT auth.uid() AS uid))) with check ((recipient_id = ( SELECT auth.uid() AS uid)));

grant SELECT,DELETE on public.notifications to authenticated;

alter table public.official_picks enable row level security;

create policy "age_verified_account" on public.official_picks as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.official_picks as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.official_picks to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.official_picks FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER capture_edge_release AFTER INSERT ON public.official_picks FOR EACH ROW EXECUTE FUNCTION private.capture_edge_release();

CREATE TRIGGER enforce_nfl_selection_gate BEFORE INSERT ON public.official_picks FOR EACH ROW EXECUTE FUNCTION private.enforce_nfl_selection_gate();

CREATE TRIGGER official_picks_cite_bible_rules BEFORE INSERT ON public.official_picks FOR EACH ROW EXECUTE FUNCTION private.cite_bible_rules();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.official_picks FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.onboarding_events enable row level security;

create policy "age_verified_account" on public.onboarding_events as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "event_owner_read" on public.onboarding_events as PERMISSIVE for SELECT to "authenticated" using (((( SELECT auth.uid() AS uid) = user_id) OR ( SELECT is_admin() AS is_admin)));

grant SELECT on public.onboarding_events to authenticated;

alter table public.personal_challenges enable row level security;

create policy "age_verified_account" on public.personal_challenges as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_read" on public.personal_challenges as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_challenges to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.personal_challenges FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

alter table public.personal_correction_decisions enable row level security;

create policy "age_verified_account" on public.personal_correction_decisions as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_read" on public.personal_correction_decisions as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_correction_decisions to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.personal_correction_decisions FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

alter table public.personal_correction_requests enable row level security;

create policy "age_verified_account" on public.personal_correction_requests as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_read" on public.personal_correction_requests as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_correction_requests to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.personal_correction_requests FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

alter table public.personal_entries enable row level security;

create policy "age_verified_account" on public.personal_entries as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_read" on public.personal_entries as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_entries to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.personal_entries FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

CREATE TRIGGER require_cleared_run BEFORE INSERT ON public.personal_entries FOR EACH ROW EXECUTE FUNCTION private.require_cleared_personal_run();

alter table public.personal_run_events enable row level security;

create policy "age_verified_account" on public.personal_run_events as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_append" on public.personal_run_events as PERMISSIVE for INSERT to "authenticated" with check (((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM personal_challenges a
  WHERE ((a.id = personal_run_events.personal_challenge_id) AND (a.user_id = ( SELECT auth.uid() AS uid)))))));

create policy "owner_read" on public.personal_run_events as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_run_events to authenticated;

CREATE TRIGGER lock_run_event BEFORE INSERT ON public.personal_run_events FOR EACH ROW EXECUTE FUNCTION private.lock_personal_run_event();

alter table public.personal_settlements enable row level security;

create policy "age_verified_account" on public.personal_settlements as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "owner_read" on public.personal_settlements as PERMISSIVE for SELECT to "authenticated" using ((user_id = ( SELECT auth.uid() AS uid)));

grant SELECT on public.personal_settlements to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.personal_settlements FOR EACH ROW EXECUTE FUNCTION private.personal_immutable_or_erasure();

alter table public.pick_entries enable row level security;

create policy "age_verified_account" on public.pick_entries as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.pick_entries as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.pick_entries to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.pick_entries FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.pick_entries FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.pick_results enable row level security;

create policy "age_verified_account" on public.pick_results as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.pick_results as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.pick_results to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.pick_results FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.pick_results FOR EACH ROW EXECUTE FUNCTION private.immutable();

CREATE TRIGGER settle_personal_entries AFTER INSERT ON public.pick_results FOR EACH ROW EXECUTE FUNCTION private.settle_personal_entries();

alter table private.account_erasure_jobs enable row level security;

create policy "erasure_jobs_deny_direct" on private.account_erasure_jobs as PERMISSIVE for ALL to "authenticated" using (false) with check (false);

alter table private.admin_users enable row level security;

create policy "no_direct_access" on private.admin_users as PERMISSIVE for ALL to "authenticated" using (false) with check (false);

alter table private.community_restrictions enable row level security;

alter table private.editorial_parlay_results enable row level security;

create policy "no_member_parlay_evidence" on private.editorial_parlay_results as PERMISSIVE for ALL to "authenticated" using (false) with check (false);

CREATE TRIGGER immutable_parlay_result BEFORE DELETE OR UPDATE ON private.editorial_parlay_results FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.leg_move_alerts enable row level security;

alter table private.leg_result_contracts enable row level security;

grant INSERT,SELECT on private.leg_result_contracts to service_role;

CREATE TRIGGER guard_numeric_sack_contract BEFORE INSERT ON private.leg_result_contracts FOR EACH ROW EXECUTE FUNCTION private.guard_numeric_sack_contract();

CREATE TRIGGER immutable_contract BEFORE DELETE OR UPDATE ON private.leg_result_contracts FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.leg_result_evidence enable row level security;

grant INSERT,SELECT on private.leg_result_evidence to service_role;

CREATE TRIGGER guard_sack_result_credit BEFORE INSERT ON private.leg_result_evidence FOR EACH ROW EXECUTE FUNCTION private.guard_sack_result_credit();

CREATE TRIGGER immutable_result_evidence BEFORE DELETE OR UPDATE ON private.leg_result_evidence FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.live_pick_alerts enable row level security;

alter table private.memberships enable row level security;

create policy "no_direct_access" on private.memberships as PERMISSIVE for ALL to "authenticated" using (false) with check (false);

alter table private.nba_result_corrections enable row level security;

CREATE TRIGGER immutable_nba_result_correction BEFORE DELETE OR UPDATE ON private.nba_result_corrections FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.nba_result_staging enable row level security;

alter table private.nba_threes_posts enable row level security;

alter table private.nfl_selection_gate_decisions enable row level security;

CREATE TRIGGER immutable_nfl_gate_decisions BEFORE DELETE OR UPDATE ON private.nfl_selection_gate_decisions FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.nfl_selection_identities enable row level security;

CREATE TRIGGER immutable_nfl_identities BEFORE DELETE OR UPDATE ON private.nfl_selection_identities FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.nfl_selection_model_approvals enable row level security;

CREATE TRIGGER immutable_nfl_models BEFORE DELETE OR UPDATE ON private.nfl_selection_model_approvals FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.nfl_selection_rule_versions enable row level security;

CREATE TRIGGER immutable_nfl_rules BEFORE DELETE OR UPDATE ON private.nfl_selection_rule_versions FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.nhl_chart_snapshots enable row level security;

CREATE TRIGGER nhl_chart_immutable BEFORE DELETE OR UPDATE ON private.nhl_chart_snapshots FOR EACH ROW EXECUTE FUNCTION private.nhl_chart_immutable();

alter table private.notification_action_rates enable row level security;

alter table private.notification_events enable row level security;

alter table private.notification_presence enable row level security;

alter table private.publish_receipts enable row level security;

create policy "no_direct_access" on private.publish_receipts as PERMISSIVE for ALL to "authenticated" using (false) with check (false);

alter table private.research_identities enable row level security;

CREATE TRIGGER immutable_research_identities BEFORE DELETE OR UPDATE ON private.research_identities FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.sports_sources enable row level security;

CREATE TRIGGER immutable_row BEFORE DELETE OR UPDATE ON private.sports_sources FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.weekly_sleeper_reviews enable row level security;

CREATE TRIGGER immutable_sleeper_review BEFORE DELETE OR UPDATE ON private.weekly_sleeper_reviews FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table private.zone_post_games enable row level security;

alter table public.process_reviews enable row level security;

create policy "age_verified_account" on public.process_reviews as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.process_reviews as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.process_reviews to authenticated;

CREATE TRIGGER audit_change AFTER INSERT OR UPDATE ON public.process_reviews FOR EACH ROW EXECUTE FUNCTION private.audit_change();

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.process_reviews FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.research_leg_results enable row level security;

create policy "age_verified_account" on public.research_leg_results as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "research_result_owner" on public.research_leg_results as PERMISSIVE for INSERT to "authenticated" with check (( SELECT is_admin() AS is_admin));

create policy "research_result_read" on public.research_leg_results as PERMISSIVE for SELECT to "authenticated" using (true);

grant INSERT,SELECT on public.research_leg_results to authenticated;

grant INSERT,SELECT on public.research_leg_results to service_role;

CREATE TRIGGER editorial_parlay_completion AFTER INSERT ON public.research_leg_results FOR EACH ROW EXECUTE FUNCTION private.complete_editorial_parlay();

CREATE TRIGGER immutable_research_results BEFORE DELETE OR UPDATE ON public.research_leg_results FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.ruby_card_comments enable row level security;

alter table public.ruby_card_revisions enable row level security;

create policy "ruby_revision_read" on public.ruby_card_revisions as PERMISSIVE for SELECT to "authenticated" using (private.ruby_visible(user_id));

grant SELECT on public.ruby_card_revisions to authenticated;

CREATE TRIGGER immutable_ruby_revision BEFORE DELETE OR UPDATE ON public.ruby_card_revisions FOR EACH ROW EXECUTE FUNCTION private.guard_ruby_revision();

CREATE TRIGGER kalshi_revision_pause BEFORE INSERT ON public.ruby_card_revisions FOR EACH ROW EXECUTE FUNCTION private.guard_kalshi_revision_pause();

alter table public.ruby_contributors enable row level security;

create policy "ruby_contributor_read" on public.ruby_contributors as PERMISSIVE for SELECT to "authenticated" using ((( SELECT private.age_member_allowed() AS age_member_allowed) AND private.community_member_allowed(user_id)));

grant SELECT on public.ruby_contributors to authenticated;

alter table public.ruby_daily_features enable row level security;

create policy "ruby_feature_read" on public.ruby_daily_features as PERMISSIVE for SELECT to "authenticated" using (((EXISTS ( SELECT 1
   FROM ruby_submissions r
  WHERE (r.id = ruby_daily_features.submission_id))) OR (EXISTS ( SELECT 1
   FROM nfl_analyst_double_ups a
  WHERE (a.id = ruby_daily_features.analyst_ticket_id)))));

grant SELECT on public.ruby_daily_features to authenticated;

alter table public.ruby_result_reports enable row level security;

create policy "ruby_reports_read" on public.ruby_result_reports as PERMISSIVE for SELECT to "authenticated" using ((EXISTS ( SELECT 1
   FROM ruby_submissions s
  WHERE ((s.id = ruby_result_reports.submission_id) AND private.ruby_visible(s.user_id)))));

grant SELECT on public.ruby_result_reports to authenticated;

alter table public.ruby_submissions enable row level security;

create policy "ruby_submission_read" on public.ruby_submissions as PERMISSIVE for SELECT to "authenticated" using (private.ruby_visible(user_id));

grant SELECT on public.ruby_submissions to authenticated;

CREATE TRIGGER kalshi_submission_pause BEFORE INSERT OR UPDATE OF source_link ON public.ruby_submissions FOR EACH ROW EXECUTE FUNCTION private.guard_kalshi_submission_pause();

alter table public.ruby_visibility_events enable row level security;

create policy "ruby_visibility_read" on public.ruby_visibility_events as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

grant SELECT on public.ruby_visibility_events to authenticated;

alter table public.saved_legs enable row level security;

create policy "age_verified_account" on public.saved_legs as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_delete" on public.saved_legs as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_insert" on public.saved_legs as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_read" on public.saved_legs as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "valid_saved_leg" on public.saved_legs as RESTRICTIVE for INSERT to "authenticated" with check ((EXISTS ( SELECT 1
   FROM published_legs l
  WHERE (l.leg_key = saved_legs.leg_key))));

grant INSERT,SELECT,DELETE on public.saved_legs to authenticated;

CREATE TRIGGER saved_leg_onboarding AFTER INSERT ON public.saved_legs FOR EACH ROW EXECUTE FUNCTION private.record_onboarding();

alter table public.sports_games enable row level security;

create policy "age_verified_account" on public.sports_games as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "public_read" on public.sports_games as PERMISSIVE for SELECT to "authenticated" using (true);

grant SELECT on public.sports_games to authenticated;

grant INSERT,SELECT,UPDATE,DELETE on public.sports_games to service_role;

alter table public.sports_markets enable row level security;

create policy "age_verified_account" on public.sports_markets as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.sports_markets as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.sports_markets to authenticated;

grant INSERT,SELECT,UPDATE,DELETE on public.sports_markets to service_role;

CREATE TRIGGER immutable_row BEFORE DELETE OR UPDATE ON public.sports_markets FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.sports_selections enable row level security;

create policy "age_verified_account" on public.sports_selections as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.sports_selections as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.sports_selections to authenticated;

grant INSERT,SELECT,UPDATE,DELETE on public.sports_selections to service_role;

CREATE TRIGGER immutable_row BEFORE DELETE OR UPDATE ON public.sports_selections FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.target_legs enable row level security;

create policy "age_verified_account" on public.target_legs as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "member_read" on public.target_legs as PERMISSIVE for SELECT to "authenticated" using (( SELECT private.has_membership() AS has_membership));

grant SELECT on public.target_legs to authenticated;

CREATE TRIGGER prevent_rewrite BEFORE DELETE OR UPDATE ON public.target_legs FOR EACH ROW EXECUTE FUNCTION private.immutable();

alter table public.topic_follows enable row level security;

create policy "age_verified_account" on public.topic_follows as RESTRICTIVE for ALL to "authenticated" using (( SELECT private.age_member_allowed() AS age_member_allowed)) with check (( SELECT private.age_member_allowed() AS age_member_allowed));

create policy "own_delete" on public.topic_follows as PERMISSIVE for DELETE to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_insert" on public.topic_follows as PERMISSIVE for INSERT to "authenticated" with check ((( SELECT auth.uid() AS uid) = user_id));

create policy "own_read" on public.topic_follows as PERMISSIVE for SELECT to "authenticated" using ((( SELECT auth.uid() AS uid) = user_id));

grant INSERT,SELECT,DELETE on public.topic_follows to authenticated;

create policy atlas_preparation_gate on public.alert_preferences as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.app_update_reads as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.app_updates as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.audit_events as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.bankroll_transactions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.candidate_releases as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.challenge_checkins as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.challenge_runs as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.challenge_stages as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.challenges as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.closing_lines as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_comment_reactions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_poll_votes as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_polls as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_post_comments as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_post_votes as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_posts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_profiles as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_reactions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_reports as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.community_shares as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.edge_releases as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.intelligence_markets as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.intelligence_models as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.intelligence_news as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.intelligence_quotes as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.leg_book_prices as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.leg_history as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.leg_market_prices as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.leg_result_progress as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.leg_tails as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.member_blocks as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.member_follows as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.member_parlays as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_editorial_picks as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_game_results as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_player_results as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_player_shooting as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_player_three_attempts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_result_progress as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nfl_analyst_double_ups as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.notification_preferences as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.notifications as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.official_picks as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.onboarding_events as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_challenges as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_correction_decisions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_correction_requests as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_entries as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_run_events as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.personal_settlements as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.pick_entries as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.pick_results as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.account_erasure_jobs as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.admin_users as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.community_restrictions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.editorial_parlay_results as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.leg_move_alerts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.leg_result_contracts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.leg_result_evidence as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.live_pick_alerts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.memberships as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nba_result_corrections as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nba_result_staging as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nba_threes_posts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nfl_selection_gate_decisions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nfl_selection_identities as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nfl_selection_model_approvals as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nfl_selection_rule_versions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.nhl_chart_snapshots as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.notification_action_rates as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.notification_events as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.notification_presence as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.publish_receipts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.research_identities as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.sports_sources as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.weekly_sleeper_reviews as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on private.zone_post_games as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.process_reviews as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.research_leg_results as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_card_comments as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_card_revisions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_contributors as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_daily_features as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_result_reports as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_submissions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.ruby_visibility_events as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.saved_legs as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.sports_games as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.sports_markets as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.sports_selections as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.target_legs as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.topic_follows as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.games as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_games as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.nba_observations as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.source_observations as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.analysis_versions as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.research_feed_posts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on public.market_snapshots as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on vq_fixture.sports as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

create policy atlas_preparation_gate on vq_fixture.posts as restrictive to authenticated using ((select private.has_membership())) with check ((select private.has_membership()));

do $external_delivery$ begin
 if to_regclass('public.notification_preferences') is not null then
 alter table public.notification_preferences alter column push_enabled set default false;
 alter table public.notification_preferences alter column email_enabled set default false;
 alter table public.notification_preferences add constraint atlas_no_external_delivery check(not push_enabled and not email_enabled);
 end if;end $external_delivery$;

do $identity_sequence$ declare s text;begin s:=pg_get_serial_sequence('public.challenges','number');if s is null then raise exception 'Missing generated identity sequence';end if;execute format('revoke all on sequence %s from public,anon,authenticated,service_role',s);end $identity_sequence$;

do $identity_sequence$ declare s text;begin s:=pg_get_serial_sequence('public.personal_correction_decisions','sequence');if s is null then raise exception 'Missing generated identity sequence';end if;execute format('revoke all on sequence %s from public,anon,authenticated,service_role',s);end $identity_sequence$;

do $identity_sequence$ declare s text;begin s:=pg_get_serial_sequence('public.personal_run_events','id');if s is null then raise exception 'Missing generated identity sequence';end if;execute format('revoke all on sequence %s from public,anon,authenticated,service_role',s);end $identity_sequence$;

do $identity_sequence$ declare s text;begin s:=pg_get_serial_sequence('private.nba_result_corrections','id');if s is null then raise exception 'Missing generated identity sequence';end if;execute format('revoke all on sequence %s from public,anon,authenticated,service_role',s);end $identity_sequence$;

revoke all on function public.age_verification_status() from public,anon,authenticated,service_role;
grant execute on function public.age_verification_status() to authenticated,service_role;

revoke all on function public.game_zone_posts(text,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.game_zone_posts(text,uuid,integer) to authenticated,service_role;

revoke all on function public.membership_status() from public,anon,authenticated,service_role;
grant execute on function public.membership_status() to authenticated,service_role;

revoke all on function public.sports_slate(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.sports_slate(text,integer) to authenticated,service_role;

revoke all on function public.tester_feature_access(text) from public,anon,authenticated,service_role;
grant execute on function public.tester_feature_access(text) to authenticated,service_role;

revoke all on function public.tester_observation_page(text,text,uuid,text,timestamp with time zone,timestamp with time zone,uuid) from public,anon,authenticated,service_role;
grant execute on function public.tester_observation_page(text,text,uuid,text,timestamp with time zone,timestamp with time zone,uuid) to authenticated,service_role;

revoke all on function vq_fixture.allowed() from public,anon,authenticated,service_role;
grant execute on function vq_fixture.allowed() to authenticated;

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

do $archive$ begin if (select archive_oid from atlas_preservation_before) is distinct from 'vq_fixture.published_legs_preserved'::regclass::oid then raise exception 'Archive OID changed';end if;end $archive$;

do $catalog_checks$ declare atlas_check record;begin for atlas_check in with
fn as (
  select n.nspname, p.proname, p.oid, p.prosecdef, p.proacl, r.rolname owner,
         pg_get_function_identity_arguments(p.oid) args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_roles r on r.oid = p.proowner
  where n.nspname not in ('pg_catalog','information_schema','extensions','graphql','graphql_public',
                          'pgbouncer','realtime','storage','vault','supabase_functions','net','cron','auth','pgsodium')
),
cnt as (
  select
    (select count(*) from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_fn,
    (select string_agg(nspname||'.'||proname, ', ') from fn where prosrc ~* '(vegasquant\.app|uowearboulykfcwnuirn|net\.http_|http_post|vault\.decrypted_secrets)') outbound_list,
    (select count(*) from pg_extension where extname in ('pg_net','pg_cron','http','dblink','postgres_fdw')) outbound_ext,
    case when to_regclass('vault.secrets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from vault.secrets', false, true, '')))[1]::text::int end vault_secrets,
    case when to_regclass('storage.buckets') is null then 0 else
      (xpath('/row/c/text()', query_to_xml('select count(*) c from storage.buckets', false, true, '')))[1]::text::int end buckets,
    (select count(*) from pg_publication_tables where pubname = 'supabase_realtime') realtime_tables,
    (select count(*) from auth.users where email is not null and email !~* '\.invalid$') real_emails,
    (select count(*) from auth.users where phone is not null and phone <> '') phones,
    (select count(*) from auth.sessions) sessions,
    (select count(*) from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal) auth_triggers,
    (select count(*) from pg_namespace where nspname = 'supabase_functions') webhook_schema,
    (select count(*) from fn where nspname = 'private'
       and (proacl is null or exists (select 1 from aclexplode(proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'))) private_public_exec,
    (select count(*) from fn where prosecdef and owner <> 'postgres') definer_wrong_owner,
    (select count(*) from fn f join pg_proc p on p.oid = f.oid where f.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')) definer_no_search_path,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity) public_no_rls,
    to_regnamespace('private') is not null private_exists,
    to_regprocedure('private.has_membership()') is not null has_membership_exists,
    to_regprocedure('private.age_eligible(uuid)') is not null age_eligible_exists,
    to_regprocedure('private.age_member_allowed()') is not null age_member_allowed_exists,
    to_regnamespace('vq_private_access_stage') is not null gate_exists,
    (select relkind from pg_class where oid = to_regclass('public.published_legs')) pl_kind,
    to_regclass('vq_fixture.published_legs_preserved') is not null archive_exists,
    (select count(*) from fn where proname in ('is_dealer_publisher','invoke_push_dispatcher','invoke_live_pick_alerts','invoke_social_dispatch')) excluded_fns,
    to_regclass('private.existing_member_premium') is not null comp_premium_table
),
checks(phase, name, ok, detail) as (
  select 'isolation','no function body reaches production or outbound HTTP/vault', outbound_fn = 0, coalesce(outbound_list,'none') from cnt
  union all select 'isolation','no pg_net/pg_cron/http/dblink/postgres_fdw', outbound_ext = 0, outbound_ext::text from cnt
  union all select 'isolation','vault.secrets empty', vault_secrets = 0, vault_secrets::text from cnt
  union all select 'isolation','no storage buckets', buckets = 0, buckets::text from cnt
  union all select 'isolation','no realtime publication tables', realtime_tables = 0, realtime_tables::text from cnt
  union all select 'isolation','auth users are synthetic (*.invalid, no phone)', real_emails = 0 and phones = 0, real_emails||' real emails, '||phones||' phones' from cnt
  union all select 'isolation','no auth.users triggers', auth_triggers = 0, auth_triggers::text from cnt
  union all select 'isolation','no database webhooks schema', webhook_schema = 0, webhook_schema::text from cnt
  union all select 'isolation','sessions (0 until isolation is accepted)', sessions = 0, sessions::text from cnt
  union all select 'isolation','every public table has RLS on', public_no_rls = 0, public_no_rls::text from cnt
  union all select 'isolation','definer functions owned by postgres', definer_wrong_owner = 0, definer_wrong_owner::text from cnt
  union all select 'isolation','definer functions pin search_path', definer_no_search_path = 0, definer_no_search_path::text from cnt
  union all select 'isolation','excluded functions absent (Dealer, dispatchers)', excluded_fns = 0, excluded_fns::text from cnt
  union all select 'isolation','complimentary-premium table absent', not comp_premium_table, comp_premium_table::text from cnt
  union all select 'prepared','gate schema installed', gate_exists, gate_exists::text from cnt
  union all select 'prepared','private schema present', private_exists, private_exists::text from cnt
  union all select 'prepared','no private function executable by PUBLIC (F3)', private_exists and private_public_exec = 0, private_public_exec::text from cnt
  union all select 'prepared','has_membership requires age (M1)', has_membership_exists and exists (
      select 1 from fn where nspname='private' and proname='has_membership' and prosrc ~ 'age_member_allowed'), has_membership_exists::text from cnt
  union all select 'prepared','age_member_allowed is definer (M2)', exists (
      select 1 from fn where nspname='private' and proname='age_member_allowed' and prosecdef), age_member_allowed_exists::text from cnt
  union all select 'prepared','age_eligible not executable by authenticated/anon (M2)', age_eligible_exists and not exists (
      select 1 from fn, aclexplode(coalesce(proacl, acldefault('f', (select oid from pg_roles where rolname = fn.owner)))) a
      where nspname='private' and proname='age_eligible' and a.privilege_type='EXECUTE'
        and a.grantee in (0, (select oid from pg_roles where rolname='authenticated'), (select oid from pg_roles where rolname='anon'))),
      age_eligible_exists::text from cnt
  union all select 'prepared','published_legs is a security-invoker view', pl_kind = 'v' and exists (
      select 1 from pg_class where oid = to_regclass('public.published_legs') and 'security_invoker=true' = any(coalesce(reloptions,'{}'))),
      coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs not granted to anon/PUBLIC', pl_kind = 'v' and not exists (
      select 1 from pg_class c, aclexplode(c.relacl) a where c.oid = to_regclass('public.published_legs')
        and a.grantee in (0, (select oid from pg_roles where rolname='anon'))), coalesce(pl_kind::text,'missing') from cnt
  union all select 'prepared','published_legs archive kept in vq_fixture', archive_exists, archive_exists::text from cnt
)
select phase, name,
  case when ok then 'PASS' when phase = 'prepared' and not (select private_exists or gate_exists from cnt) then 'NOT_PREPARED' else 'FAIL' end result,
  detail
from checks
union all
-- Preserved data: digests must equal the 2026-11-19 baseline (#294). Identity tables are limited to
-- the four baseline users, so reviewed negative-control identities (M5) may be added without
-- masking a change to existing rows, and identity rows are digested on their original columns
-- (user_id,allowed / user_id,verified) so the planned nullable entitlement bounds don't change them.
-- published_legs is read from the archive after the cutover.
select 'preserved', t.tbl,
  case when d.digest = t.baseline and d.n = t.rows then 'PASS' else 'FAIL' end,
  d.n||' rows, '||d.digest
from (values
  ('auth.users ids', 4, 'd49852dd726bfce1ac4d2f99bdcc05f4', 'select id::text x from auth.users where id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('public.games', 1, '0d4f96e41536c949ef4d95a5b4f5c6a5', 'select x::text x from public.games x'),
  ('public.nba_games', 1, 'bdae35bbdd8287e0f15464b5476ee623', 'select x::text x from public.nba_games x'),
  ('public.nba_observations', 1, '643eaae6c67e24ac752455074b80fd11', 'select x::text x from public.nba_observations x'),
  ('public.source_observations', 1, 'e06558504a3848d531eb98e56124379d', 'select x::text x from public.source_observations x'),
  ('vq_fixture.posts', 4, '41bd600253186d02cb3b466a9031357e', 'select x::text x from vq_fixture.posts x'),
  ('vq_fixture.sports', 2, '5f9f57bd3f4eb317dea0289e325887c7', 'select x::text x from vq_fixture.sports x'),
  ('vq_fixture.age_states', 3, '416b0b9c1ca06c3f8b25e61ec2a44061', 'select row(user_id,verified)::text x from vq_fixture.age_states x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('vq_fixture.entitlements', 3, '306327816f76304de7b1b2739d6ac5fd', 'select row(user_id,allowed)::text x from vq_fixture.entitlements x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('published_legs (table or archive)', 0, 'd41d8cd98f00b204e9800998ecf8427e',
     case when to_regclass('vq_fixture.published_legs_preserved') is not null
          then 'select x::text x from vq_fixture.published_legs_preserved x'
          else 'select x::text x from public.published_legs x' end)
) t(tbl, rows, baseline, q)
cross join lateral (
  select (xpath('/row/n/text()', r))[1]::text::int n, (xpath('/row/d/text()', r))[1]::text digest
  from query_to_xml(
    'select count(*) n, md5(coalesce(string_agg(x, ''|'' order by x), '''')) d from (' || t.q || ') s',
    false, true, '') r
) d
order by 1, 2 loop
 if atlas_check.result<>'PASS' then raise exception 'Staging catalog check failed: % / % / %',atlas_check.phase,atlas_check.name,atlas_check.detail;end if;end loop;end $catalog_checks$;

do $explicit_grants$ declare f jsonb;r text;actual boolean;begin for f in select * from jsonb_array_elements('[{"signature":"private.audit_change()","roles":[],"source_sha256":"9a525a7202f1d64a47f490a7055fabf6ee686608c6b568b1e83d81fdad1a8dc6"},{"signature":"private.before_age_community_member(text)","roles":[],"source_sha256":"95c3d58235a60a730f9fd91c50a5d7074cbe18442704d9c988fded4568367165"},{"signature":"private.before_age_is_admin()","roles":[],"source_sha256":"6d3e82925d172646f4b1e07b2a04d5788fc2ed1593cf6303636fe870ab6afd5e"},{"signature":"private.capture_edge_release()","roles":[],"source_sha256":"cc74bb05efccf2ad9a6a5cf8c12ac8fae5890970fadc4889a370d7b1b545a765"},{"signature":"private.cite_bible_rules()","roles":[],"source_sha256":"fc7a6c9b722093cc008beedac56d50839a3c96b045148f08ea7a196f6cb7c23f"},{"signature":"private.community_activity()","roles":["authenticated"],"source_sha256":"11c853515b4b67e3b02b59b5cf201218859a2fda6d59800be7e3a71cd6927e18"},{"signature":"private.community_follow_target_allowed(uuid)","roles":["authenticated"],"source_sha256":"0d46ccc79e9bc19b8426ddcd13e802ae7ced9fecc444848737b8d3595109eb3e"},{"signature":"private.community_member_allowed(uuid)","roles":["authenticated"],"source_sha256":"6d39af9ae8693393ec09159e2bd541ff4e2e8e898608750828bb9cb9fde4ed24"},{"signature":"private.community_photo_access()","roles":["authenticated"],"source_sha256":"6487bd8015031d3aeec79b84e3a707d8c31b87c491284600cdb91a6a6ea7812f"},{"signature":"private.community_reaction_actor_allowed()","roles":[],"source_sha256":"27f50af7f7b913812ca047b7615b2b933179d23c61a8f251ca2702c7823c2adb"},{"signature":"private.community_safety_check()","roles":[],"source_sha256":"88a35af33e20d8042ba8977fe42cb787319754cabf5bb24f1e0b38cbdfe45b6e"},{"signature":"private.complete_editorial_parlay()","roles":[],"source_sha256":"8ef9371c36325a60e68efe7209de90553449d81c0a98b76c0370095ca7253827"},{"signature":"private.create_member_parlay(text,text[])","roles":["authenticated"],"source_sha256":"55962b9cb93aab17255db892938bdc2be5f8970983533b28301d8b0dafb70e09"},{"signature":"private.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text)","roles":["authenticated"],"source_sha256":"097084403756b8c5f7a8747d24ea615ae16a50f319020288bc4a9c74f56ed5d2"},{"signature":"private.enforce_nfl_selection_gate()","roles":[],"source_sha256":"8ab7e4b8e717701eb2e2ee688af5f88638b65073981f6ce6654f7d246342446d"},{"signature":"private.enforce_research_board()","roles":[],"source_sha256":"1a26d76546781630e60566f3482398f37b61d8e2df217ad6e532e59176b58136"},{"signature":"private.enforce_weekly_sleeper()","roles":[],"source_sha256":"ce27296243fb23c0e3e0dafd745da9511bb419c28938e05fa96f4508471cb7bb"},{"signature":"private.feature_ruby(uuid,integer,text,text,timestamp with time zone)","roles":["authenticated"],"source_sha256":"d870f843c19455189cf520d25871690ce5a62490f3c2ae04ce0a0f6e96eaf943"},{"signature":"private.free_challenge_desk()","roles":["authenticated"],"source_sha256":"2525d3beebd51a7f3fc459f433c8b737c65e736cdd5b74738ea1df7058d8ecfa"},{"signature":"private.guard_community_poll()","roles":[],"source_sha256":"5e23016cd69dbbd68a41d2482ebccadd4e3da936bb877597f21f4c46a445db39"},{"signature":"private.guard_community_profile_text()","roles":[],"source_sha256":"003148cf8c9627211f85e64016a2e50fac3d241874c45065acec9a081e32eb46"},{"signature":"private.guard_community_typed_reaction()","roles":[],"source_sha256":"1fd006454b7a454216f6accbff408346a0ff8e008f71f737cf0360f64fbfd49d"},{"signature":"private.guard_kalshi_revision_pause()","roles":[],"source_sha256":"e71c3ed98d3b0853023a777d75297bfadd2c916a54b67294702431880ec9c2af"},{"signature":"private.guard_kalshi_submission_pause()","roles":[],"source_sha256":"311ad21a0502432ec9306cb234b5276e10c763f78936c98c407a4b51ca193ec6"},{"signature":"private.guard_nfl_edge_release()","roles":[],"source_sha256":"aa5d269e312b315b0e1c329a3e51a88f2b10aeaae35a172110071a1973472bf7"},{"signature":"private.guard_nfl_feed_decision()","roles":[],"source_sha256":"054a37bf1fe5acc6f530cf3cba732b4ebac418f01396fae0778c655fcd1319f2"},{"signature":"private.guard_numeric_sack_contract()","roles":[],"source_sha256":"456d4d44e85c09d9b3fad95a9245c3c8b8623986e95826402c754ce9d5c388ec"},{"signature":"private.guard_ruby_revision()","roles":[],"source_sha256":"b1b56c6935b5643207344ea55224d3d1b4844248cdacfec52bf0adf44ab1470a"},{"signature":"private.guard_sack_result_credit()","roles":[],"source_sha256":"53189d6d48aad2e32274b4c59df507ac6eec8510e85df2c00673be5c61a6d4e3"},{"signature":"private.immutable()","roles":[],"source_sha256":"864daef90b721b6a5a9424d1cf3d9437557525e1ad37e252d088e18a525ae6af"},{"signature":"private.index_source_observation()","roles":[],"source_sha256":"5a79765e9a6cd1ca2d192072005ebee231a4785ae848d2a15928603f05ae87d1"},{"signature":"private.is_admin()","roles":["authenticated"],"source_sha256":"fbad58da5e428c849447c9d5f23d6ccae169c88ae3c7e004591682a40c84946e"},{"signature":"private.is_research_release(jsonb)","roles":["service_role"],"source_sha256":"6d7b43727bd2889a34601c87443d3b1ad5d3434621acb7c579a5dc851c666787"},{"signature":"private.is_weekly_sleeper(jsonb)","roles":["service_role"],"source_sha256":"fd2e65e10b5658b43ffddd48310da9a5ca16f57cd7dbd295c1539f4bbe272d5b"},{"signature":"private.keep_first_market_price()","roles":[],"source_sha256":"9c2ed0c7f159a215fcd7eafb70320e13015b0c6584d1aeae349959f5a0760d91"},{"signature":"private.leg_tail_counts(text[])","roles":["authenticated","service_role"],"source_sha256":"ccfe954fab8488ff66c4524a125fc3a8bdc28cf2d6c1464d234e46875c629802"},{"signature":"private.lock_personal_run_event()","roles":[],"source_sha256":"9a914594e9f10871130fcfa8afbb8e354c9fcf7265235c11cb449b98d9f0758d"},{"signature":"private.nba_minor_correction(uuid,jsonb)","roles":[],"source_sha256":"da58eb43557c99d4cc50356136ff759a8d9e4b07ef52d5446e57028b21548a68"},{"signature":"private.nfl_gate_identity(uuid,text,text)","roles":[],"source_sha256":"c21afc957d320edeae42c1c2c76bb13a957309f1f701e058ba0c1c85fda3d3d0"},{"signature":"private.nfl_gate_number(jsonb)","roles":[],"source_sha256":"821ca598f65601dfc858716983febe08dc4287a58128a327bea614497787ad39"},{"signature":"private.nfl_gate_time(text)","roles":[],"source_sha256":"f936b7a72739418bb8b3a766a99dd79a9382c888908fbabf5bcbab181a35cae4"},{"signature":"private.nfl_selection_errors(jsonb,jsonb,timestamp with time zone)","roles":[],"source_sha256":"c37d4a5af407ae1143e9cc523353a20006d7b3c8631fb966484a7f22f9ed4d11"},{"signature":"private.nhl_chart_immutable()","roles":[],"source_sha256":"63f19db873c7770b14f29faa654a1d57aa78101ce7442f2cd6c7336b00b95ebf"},{"signature":"private.normalize_kalshi_source_link(text)","roles":[],"source_sha256":"03b8da086a6899a4d002ef67339cfe4fdea4869c8f167eb67c3f9a9973ea06d2"},{"signature":"private.notification_actor_followed(uuid,uuid,text)","roles":[],"source_sha256":"9835546c5d918467adbcfd2f3e3932d663c1cf4e4d2029975eeba15083d54e57"},{"signature":"private.notification_block_cleanup()","roles":[],"source_sha256":"9e4b425df95f600b49730ea61f9507e8363820f1a5f2d02c54c6b4841b38471c"},{"signature":"private.notification_follow_inbox_allowed(uuid,uuid,uuid,text)","roles":["authenticated"],"source_sha256":"1808402d036ee9a540f8a8ba59b11e76208edecc74a46b49f24647166762c28f"},{"signature":"private.notification_group_followed(uuid,uuid,uuid,text)","roles":[],"source_sha256":"59d9a13b267198fe71ff5782f1bb3a1513c964a77ee527b89c2491905d22e6d4"},{"signature":"private.notification_interaction_guard()","roles":[],"source_sha256":"1ae8d0f94bdf90d8056e1087b4c480c1abdde1c43734bfff8c703c2c811c48b4"},{"signature":"private.notification_pref_guard()","roles":[],"source_sha256":"590f8448f0452a951e254996f496dce25466b8bc275a92027543ad7d275e44ad"},{"signature":"private.notification_pulse(uuid,boolean)","roles":["authenticated"],"source_sha256":"89aedd24ceba6d1d0b8e6f91721299abecc18ae3613735c7b4b63e3f348fd982"},{"signature":"private.notification_search_document(text,text[],text)","roles":["authenticated"],"source_sha256":"c95a2d273497b8882efcb79fab9c57838e8d707b087a00c37c0f843e3ea884f9"},{"signature":"private.personal_immutable_or_erasure()","roles":[],"source_sha256":"95fd41d1025ba3285991b507ae9e4e8c1c5ab03e2f798c320def9b2ae6a4de43"},{"signature":"private.public_overview()","roles":["authenticated"],"source_sha256":"8c9a254b593e61e9e28ded426cde93b27715645afa579a095e76c40e0544ad94"},{"signature":"private.publish(text,jsonb,uuid)","roles":["authenticated"],"source_sha256":"59ac722a833c9fd32605db25f3713a9a5e1715e1167513d94b6a42468d25d082"},{"signature":"private.published_leg_recommendation(text)","roles":["authenticated"],"source_sha256":"c94b588440f6f748838e418c6727c9251f2cb57dead8b7904183d6a6ecb58c06"},{"signature":"private.recent_ruby_card_comment()","roles":["authenticated"],"source_sha256":"5035944bb64e7d882a484ba0dae8d71ee56894f26ab74f77f4bb372b2e8546b2"},{"signature":"private.record_onboarding()","roles":[],"source_sha256":"b6e5cc16f178e59b1cd8e112bab05ca92747df9cd663180815f9c591971d581b"},{"signature":"private.require_cleared_personal_run()","roles":[],"source_sha256":"3dc20d1ded7c0d8b49686e3b5ce5cc7b99f7077c3ad8fdaf3d3739eb5f8d08a6"},{"signature":"private.require_research_model_basis()","roles":[],"source_sha256":"1d7a7774860b8d5918e5f94a76b9989117496d692028cc581cc796c56552d519"},{"signature":"private.ruby_card_open(uuid)","roles":[],"source_sha256":"6a768de979c0048e56152f65cc5b6b9fb64ab2d5abf0468205e3cc00ba21a6de"},{"signature":"private.ruby_home()","roles":["authenticated"],"source_sha256":"59b44cf5b69e8e6da705c19d9b0cba3ab0d9c141c12650e4bfb5324a6f936118"},{"signature":"private.ruby_visible(uuid)","roles":["authenticated"],"source_sha256":"066b40bcb8145c72160ec2eed8989dfe41808d5fd879a1afa3b9dfe7fb7eec16"},{"signature":"private.set_community_poll_vote(uuid,integer)","roles":["authenticated"],"source_sha256":"3f0639733af88dd7d2beacdece699db3898a0e4a948531f7658d8a5064548a2b"},{"signature":"private.set_community_post_vote(uuid,integer)","roles":["authenticated"],"source_sha256":"06d685d0553920ccc121b9052d65cf0761df04a6a098a723b04bffdf61c35597"},{"signature":"private.set_community_reaction(uuid,text)","roles":["authenticated"],"source_sha256":"2181bd78572ce9b9a8d1ac795722322d2f68520dddc3e6f780c0aa1d46d8fb38"},{"signature":"private.settle_personal_entries()","roles":[],"source_sha256":"2e07c6e17f1cfaf19a1b08064ad6028fd758855251041b23db14bc0d7996f4f0"},{"signature":"private.signup_trial_expires_at()","roles":[],"source_sha256":"ab6420bd2dbc3b76c2048d426988c46a64c86d6b8e12c85670fa5e16b2fdea9b"},{"signature":"private.stamp_intelligence()","roles":[],"source_sha256":"7399d2b58e1f928cb5b9b019efc64fa0cd342b35889b5ab509dc356769b170c7"},{"signature":"private.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)","roles":["authenticated"],"source_sha256":"18c567927ec07e89ae66bf78784ae649fb8946e8756eddd26d309ea51020133f"},{"signature":"private.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text)","roles":["authenticated"],"source_sha256":"f2d8574f4caf80ed234cadaca5f34dbf91715396e941b93c4583fca3be6d68db"},{"signature":"private.validate_nba_editorial_pick()","roles":[],"source_sha256":"aa7b2f145bf00526994c846121a0543e0de1d5364eee5949de5d1907cc979149"},{"signature":"private.validate_nba_editorial_provenance()","roles":[],"source_sha256":"432c7768b38eab8ddd65cab1b1803b051875179689212d86f92019172d45e948"},{"signature":"private.validate_nba_editorial_quote_timeline()","roles":[],"source_sha256":"2ae06185221dcc9653b4d59089e05cdc880fe04773570868b48e2d0045cb4022"},{"signature":"private.validate_nba_editorial_source_timeline()","roles":[],"source_sha256":"7fabc0654df5a163f1dd6c50f3892fe007cfd609749393a534f8793fbc4c837e"},{"signature":"private.zone_editorial_leg(uuid,uuid,text,text,text,timestamp with time zone)","roles":[],"source_sha256":"65e8263f7cc0d207bd9807164e53be36ea8a7d93755299c693ffcc0ace33ace8"},{"signature":"private.zone_like(text)","roles":[],"source_sha256":"ef112ed02e321589e29c3955c8e9176ecd96fdb9554d01d6ff42656081efb043"},{"signature":"private.zone_rx(text)","roles":[],"source_sha256":"12bdecb9c2a73ee1f033d6d166cd7a8c5d57008bd9b9c733954a75eda579bcf4"},{"signature":"private.zone_side_rx(text,text,text)","roles":[],"source_sha256":"052d5372a836d1436945283d3d9ffb865dda4d99bd32d5ca19f2bd4fd12ff77a"},{"signature":"public.add_ruby_card_comment(uuid,text,uuid)","roles":["authenticated"],"source_sha256":"cb3ecc0d35dce7adcaad96ad1da92e22bdf8c35ba547459950b199a8f6a2cc4f"},{"signature":"public.community_activity()","roles":["authenticated"],"source_sha256":"f39cd74f912f4a5c4648734fa32a5eb788a8ff098ea9772f7417f023d4f73267"},{"signature":"public.community_avatars(uuid[])","roles":["authenticated"],"source_sha256":"b8fd89dbb8aa1fee09b64ec37925b48810a7ece72e070ec8e8b189d3902db5ca"},{"signature":"public.community_comments(uuid,uuid)","roles":["authenticated"],"source_sha256":"cea17c86497dadfe9f7cd4a5c76617842b4571aecf4c4ac794ea9f0a1898a8e1"},{"signature":"public.community_feed(text,integer,boolean)","roles":["authenticated"],"source_sha256":"894a7abd4bd4346e5e4a59af8de35456ef9f99788a1e1c55ffdae9fb9a3af3c4"},{"signature":"public.community_poll_states(uuid[])","roles":["authenticated"],"source_sha256":"d218ed43ada28ece6d7bfe94d68730791aef8d010f925a0ada6c9b741832246f"},{"signature":"public.community_post(uuid)","roles":["authenticated"],"source_sha256":"9630e0732593bee376dceff764fe80280361f8a8bd3a00360305e0221da6b5c3"},{"signature":"public.community_profile(text,integer)","roles":["authenticated"],"source_sha256":"638ba3de183e9dd8bfc308c35f15cea78ce105fcc826e5927198082c0077acbf"},{"signature":"public.community_reaction_state(uuid)","roles":["authenticated"],"source_sha256":"e881613d9cd4fdffaed44bcdf5493deb20e301fe8e5fb28d72029bc8acba58b2"},{"signature":"public.community_story_clock()","roles":["authenticated"],"source_sha256":"1942860d1842ab19d1cc2acb1b0cea51ea5f59cbc9dedeab6d1eb86405472519"},{"signature":"public.community_vote_states(uuid[])","roles":["authenticated"],"source_sha256":"800c17579558d1e535f9246e6e5842640605d6d3d72dca2f0ca37c67c2aa99f4"},{"signature":"public.create_community_poll_post(uuid,text,text,text,text,jsonb)","roles":["authenticated"],"source_sha256":"0b3fbe35db680ddbcea7006bc3acf45c144fd7ba4114492c88800a50f28e86fa"},{"signature":"public.create_member_parlay(text,text[])","roles":["authenticated"],"source_sha256":"22ec75b70264c893b3d08f9c3be7e93f3fd8960a413b77c4996c023a0cbbfc69"},{"signature":"public.delete_ruby_card_comment(uuid)","roles":["authenticated"],"source_sha256":"9fe8c841a0ac8cc1b6de573c31ec940102270d400983255dc8d2e8ab3129ef48"},{"signature":"public.desk_data()","roles":["authenticated"],"source_sha256":"19a819a260f1f38a6fc4e68cb7c7774d2698e5290f1413f35d86f8cd8d037866"},{"signature":"public.desk_data_compact()","roles":["authenticated","service_role"],"source_sha256":"a610467afc78938eecb6548df7c94c3b7cd63593d815e861f34aa275cca17960"},{"signature":"public.edit_ruby(uuid,integer,text,jsonb,text,text,text,integer,text)","roles":["authenticated"],"source_sha256":"5f512a518c2ab4857a477526f826a4910cf83bb5329d2addd314760cb0d57d3a"},{"signature":"public.edit_ruby_link(uuid,integer,text,jsonb,text,text,text,integer,text,text)","roles":["authenticated"],"source_sha256":"77144a4bf5fc0f79445764a3e48654e075130c748013428d7c1191b5affa6c77"},{"signature":"public.feature_ruby(uuid,integer,text,text,timestamp with time zone)","roles":["authenticated"],"source_sha256":"cada6e3a7766d14fa435504a34bdbfb655481af44b08662e48ab9d2753140a29"},{"signature":"public.is_admin()","roles":["authenticated"],"source_sha256":"00bd756d9158a92e622545ea2486cbebe43379361b10e9aee7c5596d84e3275c"},{"signature":"public.leg_tail_counts(text[])","roles":["authenticated","service_role"],"source_sha256":"279d180f569827a898b0d82aae398e16ab6ea5fe7e69f766f4a6791768a854e5"},{"signature":"public.nba_name_key(text)","roles":["authenticated","service_role"],"source_sha256":"5f77844253ab8a38cd7a45433cfe2746ccd92d22ebe810cc144342cb93d3b2ab"},{"signature":"public.nba_player_usage(text[])","roles":["authenticated","service_role"],"source_sha256":"136d24209e4eba65d298f0f569c237df6b19dcaadd855b5d5124b887c5ee203e"},{"signature":"public.notification_action(text,uuid,timestamp with time zone)","roles":["authenticated"],"source_sha256":"ca4662bf2ce6df7b2575493a8189c857013bd7c0753d7e79c32358907e0a5e77"},{"signature":"public.notification_counts()","roles":["authenticated"],"source_sha256":"1ee67f0ea276c8551c02b80eff7224b229407577e9b7aaf44169b3631fc84a88"},{"signature":"public.notification_inbox(text,text,boolean,timestamp with time zone,uuid)","roles":["authenticated"],"source_sha256":"c0a29383cfbf2dcba1c9867cc9e8d682b135e34969c79d17c06ce7742109cca2"},{"signature":"public.notification_pulse(uuid,boolean)","roles":["authenticated"],"source_sha256":"af547b81dfbfee9540e4323d490216280a1e245db60154aad135bfbaa9790ee3"},{"signature":"public.notification_view(uuid[],timestamp with time zone)","roles":["authenticated"],"source_sha256":"82f6c001c1a1a8cd9d35cc1629a4ea57a08c602459d1009f985a93d23492369f"},{"signature":"public.published_leg_catalog(timestamp with time zone)","roles":["authenticated"],"source_sha256":"b33b8a498326d28bc4866e372968b80e8dad03d7420204d14a60217f91270207"},{"signature":"public.restrict_community_member(uuid,text,boolean)","roles":["authenticated"],"source_sha256":"467b5ba9df067604858b328e58c7c7be905c4d76e566956db917ff37f8a4295a"},{"signature":"public.ruby_card_comment_counts(uuid[])","roles":["authenticated"],"source_sha256":"7e26f72dd1eb7fd334b101fbf3575c9202fe693cd27f6645b3f052cae61efe49"},{"signature":"public.ruby_card_comments(uuid)","roles":["authenticated"],"source_sha256":"cd81f0d0b3ad4a91fbd7048271865d6bcd4736ed789f481ba75a6cfd0f1b4546"},{"signature":"public.ruby_home()","roles":["authenticated"],"source_sha256":"234dfa70dd9a0052dc753eea560420be227c818e0b6a6c3e3fc7fcfb379d2bd3"},{"signature":"public.set_community_poll_vote(uuid,integer)","roles":["authenticated"],"source_sha256":"c9e57843e15c78623fbda04c7c8e7bed847bf0845a6495802bd7dac50f86b031"},{"signature":"public.set_community_post_vote(uuid,integer)","roles":["authenticated"],"source_sha256":"be60891e15b4746fe5140575dca98b86cdc4dc1d1795525c0a071c87d72a6d7c"},{"signature":"public.set_community_reaction(uuid,text)","roles":["authenticated"],"source_sha256":"66e096aa85be243efeb709982750339d3ef4645b505140afaba1844b457a4bce"},{"signature":"public.share_member_parlay(uuid)","roles":["authenticated"],"source_sha256":"a1012cf50183a4324ccc353261cd80a30ad9298078d037197a65cd05c936af61"},{"signature":"public.submit_ruby(uuid,text,text,jsonb,text,text,text,integer)","roles":["authenticated"],"source_sha256":"be77b49029b7dbbacd8e10e0af1539bdaf01723be4251b1034ab793d8b9a2048"},{"signature":"public.submit_ruby_link(uuid,text,text,jsonb,text,text,text,integer,text)","roles":["authenticated"],"source_sha256":"0c9680bb2602a66d167fc4ae553230cba7f2ece2412782c757da15504acf498c"},{"signature":"public.age_verification_status()","roles":["authenticated","service_role"]},{"signature":"public.game_zone_posts(text,uuid,integer)","roles":["authenticated","service_role"]},{"signature":"public.membership_status()","roles":["authenticated","service_role"]},{"signature":"public.sports_slate(text,integer)","roles":["authenticated","service_role"]},{"signature":"public.tester_feature_access(text)","roles":["authenticated","service_role"]},{"signature":"public.tester_observation_page(text,text,uuid,text,timestamp with time zone,timestamp with time zone,uuid)","roles":["authenticated","service_role"]},{"signature":"vq_fixture.allowed()","roles":["authenticated"]},{"signature":"vq_private_access_stage.private_development_allowed()","roles":["authenticated"]},{"signature":"vq_private_access_stage.authorized()","roles":["authenticated"]},{"signature":"public.vq_private_access_stage_authorized()","roles":["authenticated"]},{"signature":"public.vq_private_access_stage_read()","roles":["authenticated"]},{"signature":"private.has_membership()","roles":["authenticated"]},{"signature":"private.age_member_allowed()","roles":["authenticated"]},{"signature":"private.age_eligible(uuid)","roles":[]},{"signature":"private.before_age_has_membership()","roles":[]}]'::jsonb) loop foreach r in array array['authenticated','service_role'] loop actual:=has_function_privilege(r,(f->>'signature')::regprocedure,'EXECUTE');if actual is distinct from (f->'roles' ? r) then raise exception 'Unexpected function grant: % %',f->>'signature',r;end if;end loop;end loop;end $explicit_grants$;

-- No identity/session inserts in this artifact. No registry/capability activation.
commit;
