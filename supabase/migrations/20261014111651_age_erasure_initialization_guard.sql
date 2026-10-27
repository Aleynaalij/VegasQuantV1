-- begin_age_check and begin_account_erasure both lock the same auth.users row.
-- A bound provider session can be inventoried/redacted. An in-flight creation
-- must complete (or expire) before erasure can acquire its lease.
create function private.age_erasure_initialization_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.age_checks where user_id=new.user_id and provider_session is null and state='pending' and created_at>now()-interval '31 minutes') then
  raise exception 'Age verification is initializing; wait before deleting';
 end if;
 return new;
end $$;
revoke all on function private.age_erasure_initialization_guard() from public,anon,authenticated,service_role;
create trigger age_erasure_initialization_guard before insert on private.account_erasure_jobs for each row execute function private.age_erasure_initialization_guard();
