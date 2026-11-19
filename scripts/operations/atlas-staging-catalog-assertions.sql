-- ATLAS staging catalog assertions. READ-ONLY: one SELECT, no writes, no DDL.
-- Target: staging caynldluziwrzmvuslzg ONLY. Never run against production uowearboulykfcwnuirn
-- (this file asserts nothing about which project a connection points at; pin it out-of-band).
--
-- Each row is one check: phase = 'isolation' must pass before, during and after preparation;
-- 'prepared' must pass after the approved preparation (they report NOT_PREPARED before it);
-- 'preserved' compares data digests with the 2026-11-19 baseline recorded on #294.
-- Missing objects are tolerated (query_to_xml runs only when the object exists).
with
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
-- masking a change to existing rows. published_legs is read from the archive after the cutover.
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
  ('vq_fixture.age_states', 3, '416b0b9c1ca06c3f8b25e61ec2a44061', 'select x::text x from vq_fixture.age_states x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
  ('vq_fixture.entitlements', 3, '306327816f76304de7b1b2739d6ac5fd', 'select x::text x from vq_fixture.entitlements x where user_id::text in (''0cac6cd5-0262-49b7-a721-0817cd59dd8c'',''544541ae-c833-43de-838e-2f45542d1b94'',''5b21ac4f-b0fa-48e1-8066-ba644c2d4b56'',''f882aa8e-9d4e-45df-b866-1f47131e51a9'')'),
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
order by 1, 2;
