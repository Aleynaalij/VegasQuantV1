-- Profiles show a Follow button for every member, so following can no longer require that the target
-- has posted (Codex review on PR #265). The target now qualifies if they have posted, as before, or if their
-- profile passes the same checks as public.community_profile: visible, account confirmed and not banned
-- (the Dealer publisher always qualifies), and not hidden from you (private.community_member_allowed).
-- community_profiles is owner-read under RLS, so the profile check runs as a security definer helper that
-- returns only a boolean. You still write only your own rows, and can no longer follow yourself (the UI
-- never offers it); the table-wide age_verified_account policy is unchanged.
create function private.community_follow_target_allowed(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.community_profiles cp join auth.users u on u.id = cp.user_id
  where cp.user_id = target and cp.visible
   and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
        or private.is_dealer_publisher(u.id))
 ) and coalesce(private.community_member_allowed(target), false)
$$;
revoke all on function private.community_follow_target_allowed(uuid) from public, anon;
grant execute on function private.community_follow_target_allowed(uuid) to authenticated;

drop policy if exists member_follows_insert on public.member_follows;
create policy member_follows_insert on public.member_follows for insert to authenticated with check (
  user_id = (select auth.uid())
  and target_user_id <> (select auth.uid())
  and (
    exists (select 1 from public.community_posts p where p.user_id = target_user_id)
    or private.community_follow_target_allowed(target_user_id)
  )
);
