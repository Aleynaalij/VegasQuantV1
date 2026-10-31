-- NHL and college basketball display fixes (Claude, owner re-split Oct 31 2026, #166).
--  * Lines between refreshes: far-out games refresh every 3 hours but quotes expire 30 minutes after observation,
--    so the read RPCs went blank for most of the day. They now return the latest pregame quote per game and market,
--    expires_at intact; the app marks a quote stale after expiry and Slots/publication keep their own freshness checks.
--  * Selections carry the exact quote they were published against (`market`), so the line and price stay
--    visible after that quote expires. author_id stays hidden.
create or replace function public.sports_slate(p_sport text,p_days integer default 7) returns jsonb language sql stable security invoker set search_path='' as $$
 with slate as(select * from public.sports_games where sport=p_sport and start_time>=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York' and start_time<now()+make_interval(days=>greatest(1,least(p_days,14))))
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at) order by start_time,id) from slate),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join slate g on g.id=m.game_id where not exists(select 1 from public.sports_markets newer where newer.game_id=m.game_id and newer.payload->>'market'=m.payload->>'market' and newer.observed_at>m.observed_at) and g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)),'[]'),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'game_id',f.game_id,'kind',f.kind,'payload',f.payload,'source',f.source)) from public.sports_facts f join slate g on g.id=f.game_id where not exists(select 1 from public.sports_facts newer where newer.game_id=f.game_id and newer.kind=f.kind and newer.payload->>'team_id' is not distinct from f.payload->>'team_id' and newer.recorded_at>f.recorded_at)),'[]'),
 'selections',coalesce((select jsonb_agg((to_jsonb(s)-'author_id')||jsonb_build_object('market',(select q.payload||jsonb_build_object('id',q.id) from public.sports_markets q where q.id=s.market_id))) from public.sports_selections s join slate g on g.id=s.game_id),'[]'),
 'results',coalesce((select jsonb_agg(to_jsonb(r)) from public.sports_result_progress r join slate g on g.id=r.game_id),'[]'))
$$;
create or replace function public.sports_game(p_sport text,p_slug text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at)) from public.sports_games where sport=p_sport and slug=p_slug),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join public.sports_games g on g.id=m.game_id where g.sport=p_sport and g.slug=p_slug and not exists(select 1 from public.sports_markets newer where newer.game_id=m.game_id and newer.payload->>'market'=m.payload->>'market' and newer.observed_at>m.observed_at) and g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)),'[]'),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'game_id',f.game_id,'kind',f.kind,'payload',f.payload,'source',f.source)) from public.sports_facts f join public.sports_games g on g.id=f.game_id where g.sport=p_sport and g.slug=p_slug and not exists(select 1 from public.sports_facts newer where newer.game_id=f.game_id and newer.kind=f.kind and newer.payload->>'team_id' is not distinct from f.payload->>'team_id' and newer.recorded_at>f.recorded_at)),'[]'),
 'selections',coalesce((select jsonb_agg((to_jsonb(s)-'author_id')||jsonb_build_object('market',(select q.payload||jsonb_build_object('id',q.id) from public.sports_markets q where q.id=s.market_id))) from public.sports_selections s join public.sports_games g on g.id=s.game_id where g.sport=p_sport and g.slug=p_slug),'[]'),
 'results',coalesce((select jsonb_agg(to_jsonb(r)) from public.sports_result_progress r join public.sports_games g on g.id=r.game_id where g.sport=p_sport and g.slug=p_slug),'[]'))
$$;
