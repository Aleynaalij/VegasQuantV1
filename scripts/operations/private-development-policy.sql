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
