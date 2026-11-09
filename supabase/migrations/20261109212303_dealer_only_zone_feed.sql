-- Dealer-only discovery uses the configured attribution principal, not author text or card tags.
-- Only the identity lookup is privileged. Feed rows/counts retain the caller's existing RLS.
create function private.zone_dealer_publisher_id() returns uuid
language sql stable security definer set search_path='' as $$
 select a.user_id from private.zone_automation a
 where auth.uid() is not null and a.name='vq_dealer'
   and private.is_dealer_publisher(a.user_id)
$$;
revoke all on function private.zone_dealer_publisher_id() from public,anon,authenticated,service_role;
grant execute on function private.zone_dealer_publisher_id() to authenticated;

create function public.community_dealer_feed(p_sport text default 'all', p_limit integer default 20)
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
 select p.*,
 (select count(*) from public.community_reactions r where r.post_id=p.id) as reactions,
 exists(select 1 from public.community_reactions r where r.post_id=p.id and r.user_id=auth.uid()) as reacted,
 (select count(*) from public.community_post_comments c where c.post_id=p.id) as comments,
 exists(select 1 from public.member_follows f where f.user_id=auth.uid() and f.target_user_id=p.user_id) as following
 from public.community_posts p
 where p.user_id=(select private.zone_dealer_publisher_id())
   and (p_sport='all' or p.sport=p_sport)
 order by p.created_at desc,p.id desc limit greatest(1,least(p_limit,100))
 )x
$$;
revoke all on function public.community_dealer_feed(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.community_dealer_feed(text,integer) to authenticated;
