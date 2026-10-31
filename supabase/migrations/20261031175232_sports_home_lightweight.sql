-- Home/Slots need schedules, exact quotes and publications, not multi-megabyte roster/stat bodies.
-- Keep sports_slate/sports_game intact for existing clients and full matchup research.
create function public.sports_home(p_sport text,p_days integer default 7) returns jsonb
language sql stable security invoker set search_path='' as $$
 with slate as materialized (
  select * from public.sports_games where sport=p_sport and sport in ('nhl','ncaab')
  and start_time>=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York'
  and start_time<now()+make_interval(days=>greatest(1,least(p_days,14)))
 ), latest as (
  select m.game_id,m.payload->>'market' family,max(m.observed_at) observed_at
  from public.sports_markets m join slate g on g.id=m.game_id
  where g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)
   and coalesce(g.payload->>'status','') !~* 'FINAL|CANCEL|POSTPON|SUSPEND|IN_PROGRESS|HALFTIME|END_PERIOD'
  group by m.game_id,m.payload->>'market'
 )
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),
 'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at) order by start_time,id) from slate),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join latest l on l.game_id=m.game_id and l.family=m.payload->>'market' and l.observed_at=m.observed_at),'[]'),
 'selections',coalesce((select jsonb_agg((to_jsonb(s)-'author_id')||jsonb_build_object('market',(select q.payload||jsonb_build_object('id',q.id) from public.sports_markets q where q.id=s.market_id))) from public.sports_selections s join slate g on g.id=s.game_id),'[]'),
 'facts','[]'::jsonb,'results','[]'::jsonb)
$$;
revoke all on function public.sports_home(text,integer) from public;
grant execute on function public.sports_home(text,integer) to anon,authenticated,service_role;
