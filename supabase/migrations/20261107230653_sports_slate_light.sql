-- sports_slate without multi-megabyte provider bodies (Claude, owner request Nov 7 2026).
-- Its only app client is the research lounge (src/lib/research-hub-reader.ts). It reads facts only for
-- team_context injuries and a few named text fields, yet the RPC returned every latest roster and
-- team_context body: about 16 MB for a 7-day NCAAB slate and 5 MB for NHL. Building that pushed the call
-- past the API statement timeout, so the lounge showed NHL and NCAAB as "unavailable".
-- Now: facts are team_context only, trimmed to those fields; markets use sports_home's grouped
-- latest-per-market lookup. Games, selections, results, access and the response shape are unchanged.
-- sports_game (the full matchup page) is untouched.
create or replace function public.sports_slate(p_sport text,p_days integer default 7) returns jsonb language sql stable security invoker set search_path='' as $$
 with slate as materialized (select * from public.sports_games where sport=p_sport and start_time>=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York' and start_time<now()+make_interval(days=>greatest(1,least(p_days,14)))),
 latest as (
  select m.game_id,m.payload->>'market' family,max(m.observed_at) observed_at
  from public.sports_markets m join slate g on g.id=m.game_id
  where g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)
  group by m.game_id,m.payload->>'market'
 ),
 fact as (
  select distinct on (f.game_id,f.payload->>'team_id') f.id,f.game_id,f.kind,f.source,
   jsonb_strip_nulls(jsonb_build_object('team_id',f.payload->'team_id','injuries',f.payload->'injuries',
    'availability',f.payload->'availability','goalie_confirmation',f.payload->'goalie_confirmation',
    'note',f.payload->'note','summary',f.payload->'summary','team_form',f.payload->'team_form')) payload
  from public.sports_facts f join slate g on g.id=f.game_id
  where f.kind='team_context'
  order by f.game_id,f.payload->>'team_id',f.recorded_at desc
 )
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at) order by start_time,id) from slate),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join latest l on l.game_id=m.game_id and l.family=m.payload->>'market' and l.observed_at=m.observed_at),'[]'),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',id,'game_id',game_id,'kind',kind,'payload',payload,'source',source)) from fact),'[]'),
 'selections',coalesce((select jsonb_agg((to_jsonb(s)-'author_id')||jsonb_build_object('market',(select q.payload||jsonb_build_object('id',q.id) from public.sports_markets q where q.id=s.market_id))) from public.sports_selections s join slate g on g.id=s.game_id),'[]'),
 'results',coalesce((select jsonb_agg(to_jsonb(r)) from public.sports_result_progress r join slate g on g.id=r.game_id),'[]'))
$$;
