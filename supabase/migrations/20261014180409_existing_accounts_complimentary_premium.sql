-- Complimentary access for the existing account cohort only; no payments or future signup changes.
create table private.existing_member_premium(
 user_id uuid primary key references auth.users(id) on delete cascade,
 granted_at timestamptz not null default now(),revoked_at timestamptz,
 reason text not null default 'Owner-authorized complimentary Premium for existing accounts'
);
alter table private.existing_member_premium enable row level security;
create policy no_direct_member_grants on private.existing_member_premium for all to anon,authenticated using(false)with check(false);
revoke all on private.existing_member_premium from public,anon,authenticated;
grant select on private.existing_member_premium to service_role;
insert into private.existing_member_premium(user_id)select id from auth.users where not coalesce(is_anonymous,false)and created_at<=statement_timestamp();
do $$declare body text;begin
 select prosrc into body from pg_proc where oid='private.before_age_has_membership()'::regprocedure;
 body:=regexp_replace(body,';\s*$','');
 execute format('create or replace function private.before_age_has_membership()returns boolean language sql stable security definer set search_path='''' as %L',
 'select base.allowed or exists(select 1 from private.existing_member_premium where user_id=auth.uid() and revoked_at is null)from('||body||')base(allowed)');
 select prosrc into body from pg_proc where oid='private.membership_status()'::regprocedure;
 body:=regexp_replace(body,';\s*$','');
 execute format('create or replace function private.membership_status()returns jsonb language sql stable security definer set search_path='''' as %L',
 'select base.status||jsonb_build_object(''complimentary_premium'',c.active)||case when c.active then jsonb_build_object(''trial_active'',false,''expires_at'',null)else ''{}''::jsonb end from('||body||')base(status)cross join lateral(select exists(select 1 from private.existing_member_premium where user_id=auth.uid() and revoked_at is null)active)c');
end $$;
