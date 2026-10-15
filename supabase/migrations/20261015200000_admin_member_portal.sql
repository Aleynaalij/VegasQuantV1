-- Admin member portal: real last-activity (session refreshes, not just fresh sign-ins), usernames
-- and a summary in the admin account list, plus admin-initiated account deletion.

-- 1) Account list. Same signature and access rule (verified administrator) as before; adds
--    last_active, username and summary counts, and searches usernames too.
create or replace function private.admin_accounts(p_search text default '', p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; q text := lower(left(coalesce(p_search, ''), 120));
begin
 if not private.is_admin() then raise exception 'Verified administrator required' using errcode = '42501'; end if;
 with base as (
  select u.id, u.email, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed,
   (select max(greatest(s.updated_at, coalesce(s.refreshed_at at time zone 'UTC', s.updated_at)))
      from auth.sessions s where s.user_id = u.id) as last_active,
   (select c.username from public.community_profiles c where c.user_id = u.id) as username
  from auth.users u
 ), matched as (
  select b.*, greatest(b.last_active, b.last_sign_in_at) as seen from base b
  where strpos(lower(coalesce(b.email, '')), q) > 0 or strpos(lower(coalesce(b.username, '')), q) > 0
 )
 select jsonb_build_object(
  'total', (select count(*) from matched),
  'summary', (select jsonb_build_object(
    'members', count(*),
    'active_24h', count(*) filter (where x.seen > now() - interval '24 hours'),
    'active_7d', count(*) filter (where x.seen > now() - interval '7 days'),
    'never', count(*) filter (where x.seen is null),
    'premium', count(*) filter (where exists(select 1 from private.memberships ms where ms.user_id = x.id and ms.revoked_at is null and ms.starts_at <= now() and ms.expires_at > now()))
   ) from (select b.id, greatest(b.last_active, b.last_sign_in_at) as seen from base b) x),
  'accounts', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
   select m.id, m.email, m.username, m.created_at, m.last_sign_in_at, m.seen as last_active, m.confirmed,
    exists(select 1 from private.admin_users a where a.user_id = m.id) as administrator,
    (select max(ms.expires_at) from private.memberships ms where ms.user_id = m.id and ms.revoked_at is null and ms.starts_at <= now() and ms.expires_at > now()) as access_until,
    exists(select 1 from private.friend_redemptions r where r.user_id = m.id) as friends_pass,
    (select count(*) from public.personal_entries e where e.user_id = m.id) as tail_count,
    (select count(*) from public.personal_entry_state e where e.user_id = m.id and e.result is null) as open_tail_count
   from matched m
   order by m.created_at desc, m.id
   limit 50 offset (greatest(0, least(coalesce(p_page, 0), 100000)) * 50)
  ) t),
  'promos', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'code', code, 'used', used_count, 'limit', max_uses, 'expires_at', expires_at, 'active', disabled_at is null and expires_at > now() and used_count < max_uses)), '[]'::jsonb) from private.friend_promos)
 ) into result;
 return result;
end $$;

-- 2) Admin-initiated deletion. Mirrors begin_account_erasure (same lease, billing, photo and
--    identity plan) but is authorized by an administrator instead of the member's own session.
--    Never deletes an administrator or the caller. Only the server (service_role) can run it,
--    after confirming the caller is a verified administrator.
create table private.admin_account_deletions(
 id uuid primary key default gen_random_uuid(),
 admin_id uuid not null,
 user_id uuid not null,
 requested_at timestamptz not null default now()
);
alter table private.admin_account_deletions enable row level security;
grant select, insert on private.admin_account_deletions to service_role;

create function private.begin_admin_account_erasure(p_admin uuid, p_user uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare lease uuid;
begin
 if not exists(select 1 from private.admin_users where user_id = p_admin) then raise exception 'Administrator required'; end if;
 if p_admin = p_user then raise exception 'Use Account to delete your own account'; end if;
 perform 1 from auth.users where id = p_user for update;
 if not found then raise exception 'Account unavailable'; end if;
 if exists(select 1 from private.admin_users where user_id = p_user) then raise exception 'Administrator accounts cannot be deleted here'; end if;
 if exists(select 1 from storage.objects where owner_id = p_user::text and bucket_id <> 'community-photos') then raise exception 'Account contains storage objects requiring cleanup'; end if;
 if exists(select 1 from private.billing_orders where user_id = p_user and state = 'pending' and checkout_id is null and created_at > now() - interval '31 minutes') then raise exception 'Checkout is initializing; wait for it to finish or expire before deleting'; end if;
 insert into private.account_erasure_jobs(user_id) values(p_user)
  on conflict(user_id) do update set lease_id = gen_random_uuid(), ready = false, expires_at = now() + interval '10 minutes'
  where account_erasure_jobs.expires_at < now()
  returning lease_id into lease;
 if lease is null then raise exception 'Deletion is already in progress'; end if;
 update public.account_deletion_requests set status = 'processing' where user_id = p_user and status = 'pending';
 insert into private.admin_account_deletions(admin_id, user_id) values(p_admin, p_user);
 return jsonb_build_object('lease', lease,
  'orders', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'checkout_id', checkout_id)), '[]') from private.billing_orders where user_id = p_user),
  'storage_paths', (select coalesce(jsonb_agg(name), '[]') from storage.objects where owner_id = p_user::text and bucket_id = 'community-photos'),
  'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'customer_id', customer_id, 'order_id', order_id)), '[]') from private.billing_subscriptions where user_id = p_user));
end $$;
revoke all on function private.begin_admin_account_erasure(uuid, uuid) from public, anon, authenticated;
grant execute on function private.begin_admin_account_erasure(uuid, uuid) to service_role;
create function public.begin_admin_account_erasure(p_admin uuid, p_user uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.begin_admin_account_erasure(p_admin, p_user); $$;
revoke all on function public.begin_admin_account_erasure(uuid, uuid) from public, anon, authenticated;
grant execute on function public.begin_admin_account_erasure(uuid, uuid) to service_role;
