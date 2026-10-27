create table public.member_phone_contacts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 sms_opt_in boolean not null default false,
 consent_at timestamptz,
 consent_version text not null default 'sms-interest-v1',
 updated_at timestamptz not null default now(),
 check((sms_opt_in and consent_at is not null) or (not sms_opt_in and consent_at is null))
);
alter table public.member_phone_contacts enable row level security;
revoke all on public.member_phone_contacts from anon,authenticated;
grant select,insert,update,delete on public.member_phone_contacts to authenticated;
create policy own_phone_select on public.member_phone_contacts for select to authenticated using ((select auth.uid())=user_id);
create policy own_phone_insert on public.member_phone_contacts for insert to authenticated with check ((select auth.uid())=user_id);
create policy own_phone_update on public.member_phone_contacts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy own_phone_delete on public.member_phone_contacts for delete to authenticated using ((select auth.uid())=user_id);

