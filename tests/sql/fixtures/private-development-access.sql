-- Local authorization proof for #294. This fixture is never applied by migrations.
create table private.private_development_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);

create table private.private_development_owners (
  user_id uuid primary key references auth.users(id) on delete cascade
);

revoke all on private.private_development_settings,
  private.private_development_owners from public, anon, authenticated, service_role;

insert into private.private_development_settings default values;

create function private.private_development_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case (select enabled from private.private_development_settings)
    when false then true
    when true then
      (auth.jwt() ->> 'aal' = 'aal2') is true
      and (auth.jwt() ->> 'is_anonymous') is distinct from 'true'
      and exists (
        select 1
        from private.private_development_owners o
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

revoke all on function private.private_development_allowed() from public, service_role;
grant execute on function private.private_development_allowed() to anon, authenticated;

-- Model existing grants in a disposable database. These objects are acceptance
-- fixtures for different authorization surfaces, not application policies.
create table public.fixture_research (
  body text primary key
);
insert into public.fixture_research values ('protected research');

create table public.fixture_memberships (
  user_id uuid primary key
);
grant usage on schema auth to anon, authenticated, service_role;
alter table public.fixture_memberships enable row level security;
create policy own_membership on public.fixture_memberships
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.fixture_memberships to authenticated;

alter table public.fixture_research enable row level security;
create policy member_read on public.fixture_research
  for select to authenticated using (exists (select 1 from public.fixture_memberships));
create policy private_development on public.fixture_research
  as restrictive for select to authenticated using ((select private.private_development_allowed()));
grant select on public.fixture_research to authenticated;

create function public.fixture_research_invoker() returns setof text
language sql stable security invoker set search_path = ''
as $$ select body from public.fixture_research $$;

-- A definer owned by the table owner bypasses its RLS. It must check both
-- the mode and the caller's existing entitlement itself.
create function public.fixture_research_definer() returns setof text
language sql stable security definer set search_path = ''
as $$
  select body from public.fixture_research
  where (select private.private_development_allowed())
    and exists (select 1 from public.fixture_memberships where user_id = (select auth.uid()))
$$;

revoke all on function public.fixture_research_invoker(), public.fixture_research_definer() from public;
grant execute on function public.fixture_research_invoker(), public.fixture_research_definer() to authenticated;

create schema storage;
grant usage on schema storage to authenticated;
create table storage.fixture_objects (owner_id uuid not null, name text primary key);
alter table storage.fixture_objects enable row level security;
create policy own_object on storage.fixture_objects
  for all to authenticated using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy private_development on storage.fixture_objects
  as restrictive for all to authenticated using ((select private.private_development_allowed()))
  with check ((select private.private_development_allowed()));
grant select, insert, delete on storage.fixture_objects to authenticated;

create table public.fixture_events (recipient_id uuid not null, event text primary key);
alter table public.fixture_events enable row level security;
create policy own_event on public.fixture_events
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy private_development on public.fixture_events
  as restrictive for select to authenticated using ((select private.private_development_allowed()));
grant select on public.fixture_events to authenticated;
grant insert on public.fixture_events to service_role;
create publication fixture_realtime for table public.fixture_events;
