-- Member profiles, Instagram/X style (owner request, Nov 9 2026): avatar, username, follower and following
-- counts, and the member's posts. Replaces the old "journey" timeline (challenge joins, stage check-ins and
-- wins from the launch-era challenge), which the new profile page no longer shows; the old
-- community_member RPC is left in place untouched.
--  * Same visibility as community_member: signed in, age-verified, and the profile is visible (or your own),
--    the account confirmed and not banned (the Dealer publisher always qualifies), and the member is not
--    hidden from you (private.community_member_allowed: blocks and restrictions).
--  * Follower/following counts are aggregates only; who follows whom stays private (member_follows RLS is
--    unchanged).
--  * Posts: newest first, up to 60, with reaction and comment counts, in the same shape as community_feed.

create function public.community_profile(p_username text, p_limit integer default 30) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 me uuid := auth.uid();
 p public.community_profiles;
 since timestamptz;
begin
 if me is null or not coalesce(private.age_member_allowed(), false) then return null; end if;
 select cp.* into p from public.community_profiles cp join auth.users u on u.id = cp.user_id
 where lower(cp.username) = lower(p_username)
  and (cp.user_id = me or cp.visible)
  and ((u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until <= now()))
       or private.is_dealer_publisher(u.id));
 if not found then return null; end if;
 if p.user_id <> me and not coalesce(private.community_member_allowed(p.user_id), false) then return null; end if;
 select created_at into since from auth.users where id = p.user_id;
 return jsonb_build_object(
  'user_id', p.user_id,
  'username', p.username,
  'avatar', p.avatar,
  'region', p.region,
  'instagram_url', p.instagram_url,
  'x_url', p.x_url,
  'member_since', since,
  'is_me', p.user_id = me,
  'i_follow', exists (select 1 from public.member_follows f where f.user_id = me and f.target_user_id = p.user_id),
  'followers', (select count(*) from public.member_follows f where f.target_user_id = p.user_id),
  'following', (select count(*) from public.member_follows f where f.user_id = p.user_id),
  'post_count', (select count(*) from public.community_posts c where c.user_id = p.user_id),
  'posts', coalesce((
   select jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc) from (
    select c.id, c.sport, c.kind, c.title, c.body, c.legs, c.photo_path, c.card, c.created_at,
     (select count(*) from public.community_reactions r where r.post_id = c.id) as reactions,
     (select count(*) from public.community_post_comments k where k.post_id = c.id) as comments
    from public.community_posts c where c.user_id = p.user_id
    order by c.created_at desc, c.id desc limit greatest(1, least(coalesce(p_limit, 30), 60))
   ) x), '[]'::jsonb)
 );
end $$;
revoke all on function public.community_profile(text, integer) from public, anon, authenticated;
grant execute on function public.community_profile(text, integer) to authenticated;
