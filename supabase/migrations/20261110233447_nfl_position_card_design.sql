-- Public image projection of Dealer-only, research-only DvP reports. No publisher or schedule changes.
create function public.nfl_position_card(p_post uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('body',p.body,'game',jsonb_build_object(
   'away_team',g.away_team,'home_team',g.home_team,'kickoff',g.kickoff))
 from public.community_posts p
 join public.games g on g.id::text=substring(p.body from 'Game ([0-9a-f-]{36})')
 where p.id=p_post and p.sport='nfl' and p.kind='talk'
 and p.card='vq-publication:v1' and p.legs='[]'::jsonb and p.stake is null
 and p.title like 'Defense vs Position · %'
 and private.is_dealer_publisher(p.user_id)
 and exists(select 1 from public.community_profiles cp where cp.user_id=p.user_id and cp.visible)
$$;
revoke all on function public.nfl_position_card(uuid) from public;
grant execute on function public.nfl_position_card(uuid) to anon,authenticated,service_role;
