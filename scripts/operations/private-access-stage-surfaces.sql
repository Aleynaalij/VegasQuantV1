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
