-- Only voluntarily visible, confirmed member profiles appear in the Home rail.
-- Definer is limited to the public avatar/username lookup (profile RLS is owner-only).
create function private.community_activity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc,x.post_id desc) from (
  select latest.id as post_id,cp.username,cp.avatar,latest.sport,latest.created_at
  from public.community_profiles cp
  join auth.users u on u.id=cp.user_id
  cross join lateral (
   select p.id,p.sport,p.created_at from public.community_posts p
   where p.user_id=cp.user_id
   order by p.created_at desc,p.id desc limit 1
  ) latest
  where cp.visible and u.email_confirmed_at is not null
  and (u.banned_until is null or u.banned_until<=now())
  and private.community_member_allowed(cp.user_id)
  order by latest.created_at desc,latest.id desc limit 24
 ) x),'[]'::jsonb);
end $$;
revoke all on function private.community_activity() from public,anon,authenticated;
grant execute on function private.community_activity() to authenticated;
create function public.community_activity() returns jsonb language sql stable security invoker set search_path='' as $$ select private.community_activity() $$;
revoke all on function public.community_activity() from public,anon,authenticated;
grant execute on function public.community_activity() to authenticated;

-- Exact deep links must work even when the post is outside the first feed page.
-- Invoker preserves the existing read, block and comment policies.
create function public.community_post(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(x) from (
  select p.*,
   (select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
   exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
   (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
   exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
  from public.community_posts p where p.id=p_id and private.community_member_allowed(p.user_id)
 ) x
$$;
revoke all on function public.community_post(uuid) from public,anon,authenticated;
grant execute on function public.community_post(uuid) to authenticated;
