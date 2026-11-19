-- GENERATED / UNREVIEWED. Separate option-(b) proposal; NOT approved by prepare.sql sign-off.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';set local search_path=pg_catalog,public;
set local vq.review.target_ref='caynldluziwrzmvuslzg';
select pg_advisory_xact_lock(hashtextextended('atlas-staging-preparation-v1',0));
do $free_target$ begin
 if current_user<>'postgres' or session_user<>'postgres' or current_setting('vq.review.target_ref',true) is distinct from 'caynldluziwrzmvuslzg' then raise exception 'Pinned staging executor required';end if;
 if to_regclass('vq_fixture.published_legs_preserved') is null or (select count(*) from auth.users)<>4 or exists(select 1 from auth.sessions)
 or exists(select 1 from vq_private_access_stage.private_development_owners) or exists(select 1 from vq_private_access_stage.entitlements) then raise exception 'Reviewed prepared zero-session four-user stage required';end if;
 if exists(select 1 from pg_attribute where attrelid='public.games'::regclass and attname in ('slot','created_at') and attnum>0 and not attisdropped)
 or to_regprocedure('vq_private_access_stage.free_challenge_desk()') is not null then raise exception 'Single-use free Home proposal refuses existing adaptation';end if;
 if encode(sha256(convert_to(pg_get_functiondef('private.free_challenge_desk()'::regprocedure),'UTF8')),'hex')<>'2525d3beebd51a7f3fc459f433c8b737c65e736cdd5b74738ea1df7058d8ecfa' then raise exception 'Free denial differs from approved preparation';end if;
 if encode(sha256(convert_to(pg_get_functiondef('public.desk_data()'::regprocedure),'UTF8')),'hex')<>'19a819a260f1f38a6fc4e68cb7c7774d2698e5290f1413f35d86f8cd8d037866' then raise exception 'Original desk source drift: public.desk_data';end if;
if encode(sha256(convert_to(pg_get_functiondef('public.desk_data_compact()'::regprocedure),'UTF8')),'hex')<>'a610467afc78938eecb6548df7c94c3b7cd63593d815e861f34aa275cca17960' then raise exception 'Original desk source drift: public.desk_data_compact';end if;
 end $free_target$;
lock table public.games in access exclusive mode;
do $preserved$ declare check_row record;begin for check_row in with
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
  ('public.games', 1, '0d4f96e41536c949ef4d95a5b4f5c6a5', 'select row(x."id",x."sport",x."slug",x."away_team",x."home_team",x."kickoff",x."kickoff_tbd",x."venue",x."roof",x."schedule_source",x."schedule_observed_at")::text x from public.games x'),
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
order by 1, 2 loop if check_row.result<>'PASS' then raise exception 'Free-Home preservation/isolation failure: % / %',check_row.name,check_row.detail;end if;end loop;end $preserved$;
create temporary table free_home_before on commit drop as select 'public.games'::regclass::oid games_oid, 'vq_fixture.published_legs_preserved'::regclass::oid archive_oid;

alter table public.games add column "slot" text; -- Nullable, no default, no UPDATE of original rows.

alter table public.games add column "created_at" timestamp with time zone; -- Nullable, no default, no UPDATE of original rows.

CREATE OR REPLACE FUNCTION private.free_challenge_desk()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
select jsonb_build_object('free_core',true,'access',public.membership_status(),'overview',private.public_overview(),
'games',(select coalesce(jsonb_agg(to_jsonb(x) order by kickoff),'[]'::jsonb) from (select id,slug,away_team,home_team,kickoff,venue,slot,created_at from public.games) x),
'challenges',(select coalesce(jsonb_agg(to_jsonb(x) order by number desc),'[]'::jsonb) from (select id,number,name,starting_cents,target_cents,balance_cents,status,current_stage,pause_reason,created_at from public.challenges) x),
'stages',(select coalesce(jsonb_agg(to_jsonb(x) order by stage_number),'[]'::jsonb) from (select id,challenge_id,stage_number,slot,game_id,status,pass_reason from public.challenge_stages) x),
'picks',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,game_id,stage_id,market,selection,recommended_line,direction,odds,stake_cents,model_probability,market_probability,edge,confidence,risk,predicted_close,best_number,bet_grade,fear_index,timing,why_like,why_lose,playable_number,pass_number,book,created_at,market_info_url,gambly_url from public.official_picks) x),
'entries',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,line,odds,source,bet_at,created_at from public.pick_entries) x),
'closings',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,line,odds,source,observed_at,created_at from public.closing_lines) x),
'results',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,pick_id,result,away_score,home_score,profit_cents,bankroll_cents,source,created_at from public.pick_results) x),
'transactions',(select coalesce(jsonb_agg(to_jsonb(x) order by created_at desc),'[]'::jsonb) from (select id,challenge_id,pick_id,kind,amount_cents,balance_cents,created_at from public.bankroll_transactions) x),'markets','[]'::jsonb,'analyses','[]'::jsonb,'reviews','[]'::jsonb,'audit','[]'::jsonb);
$function$
;

alter function private.free_challenge_desk() owner to postgres;
revoke all on function private.free_challenge_desk() from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION vq_private_access_stage.free_challenge_desk()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not coalesce(vq_private_access_stage.authorized(),false)
   or not coalesce(private.age_member_allowed(),false) then
  raise exception 'Isolated free Home requires the live verified-age gate' using errcode='42501';
 end if;
 return private.free_challenge_desk();
end
$function$
;

alter function vq_private_access_stage.free_challenge_desk() owner to postgres;
revoke all on function vq_private_access_stage.free_challenge_desk() from public,anon,authenticated,service_role;
grant execute on function vq_private_access_stage.free_challenge_desk() to authenticated;

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
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from public.audit_events t)) else vq_private_access_stage.free_challenge_desk() end; $function$
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
 'audit',(select coalesce(jsonb_agg(t order by created_at desc),'[]') from (select * from public.audit_events where false) t)) else vq_private_access_stage.free_challenge_desk() end; $function$
;

do $preserved$ declare check_row record;begin for check_row in with
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
  ('public.games', 1, '0d4f96e41536c949ef4d95a5b4f5c6a5', 'select row(x."id",x."sport",x."slug",x."away_team",x."home_team",x."kickoff",x."kickoff_tbd",x."venue",x."roof",x."schedule_source",x."schedule_observed_at")::text x from public.games x'),
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
order by 1, 2 loop if check_row.result<>'PASS' then raise exception 'Free-Home preservation/isolation failure: % / %',check_row.name,check_row.detail;end if;end loop;end $preserved$;

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


do $verify$ begin
 if (select games_oid from free_home_before)<>'public.games'::regclass::oid or (select archive_oid from free_home_before)<>'vq_fixture.published_legs_preserved'::regclass::oid then raise exception 'Preserved relation OID changed';end if;
 if encode(sha256(convert_to(pg_get_functiondef('private.free_challenge_desk()'::regprocedure),'UTF8')),'hex')<>'3ad9fc204cbd41d693a2cb14b4e8d51989f43c8941bcc4c1b342987b83450bd4' then raise exception 'Original free definition was not restored byte-identical';end if;
 if has_function_privilege('authenticated','private.free_challenge_desk()','EXECUTE') or has_function_privilege('anon','private.free_challenge_desk()','EXECUTE') then raise exception 'Original free definer must remain internal-only';end if;
 if exists(select 1 from pg_proc where oid in ('public.desk_data()'::regprocedure,'public.desk_data_compact()'::regprocedure) and prosecdef) then raise exception 'Paid desk paths must stay invoker/RLS-bound';end if;
 if exists(select 1 from public.games where slot is not null or created_at is not null) then raise exception 'New fixture columns must remain unpopulated';end if;
 end $verify$;
commit;
