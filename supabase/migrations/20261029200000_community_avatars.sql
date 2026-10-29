-- Zone redesign (owner, Oct 29 2026): posts show their author's profile photo, Instagram-style.
-- Profiles are readable only by their owner, so the feed asks for the photos of the authors on screen.
-- Same visibility rules as the story strip (community_activity): visible, confirmed, not banned, not
-- blocked either way, and the viewer passes the age gate. At most 100 authors per call.
create function public.community_avatars(p_users uuid[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not (select private.age_member_allowed()) then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id', cp.user_id, 'avatar', cp.avatar))
  from public.community_profiles cp join auth.users u on u.id = cp.user_id
  where cp.user_id = any(p_users[1:100]) and cp.visible and cp.avatar is not null
   and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now())
   and private.community_member_allowed(cp.user_id)), '[]'::jsonb);
end $$;
revoke all on function public.community_avatars(uuid[]) from public, anon;
grant execute on function public.community_avatars(uuid[]) to authenticated;
