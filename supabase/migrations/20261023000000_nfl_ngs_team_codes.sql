-- NGS writes Washington as WAS; games (ESPN) use WSH, so Commanders players never matched a game's
-- Next Gen Stats context. Same function and signature with the one team code mapped; grants stay.
create or replace function public.nfl_ngs_game_context(p_game_id uuid,p_before timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with game as(select *,
  case away_abbreviation when 'WSH' then 'WAS' else away_abbreviation end away_ngs,
  case home_abbreviation when 'WSH' then 'WAS' else home_abbreviation end home_ngs
  from public.games where id=p_game_id and lower(sport)='nfl'),
 latest as(
  select distinct on(s.stat_type) s.* from public.nfl_ngs_snapshots s,game g
  where s.retrieved_at<=least(coalesce(p_before,now()),now()) and g.season=any(s.seasons)
  order by s.stat_type,s.retrieved_at desc,s.recorded_at desc
 ), datasets as(
  select s.id,s.stat_type,s.source_url,s.source_sha256,s.source_updated_at,s.retrieved_at,s.attribution,
  (select max((x->>'week')::integer) from jsonb_array_elements(s.rows) x,game g where (x->>'season')::integer=g.season and x->>'season_type'='REG' and (x->>'week')::integer between 1 and g.week-1) as through_week,
  coalesce((select jsonb_agg(r order by r->>'team_abbr',r->>'player_display_name') from (
   select distinct on(x->>'player_gsis_id',x->>'team_abbr') x as r from jsonb_array_elements(s.rows) x,game g
   where (x->>'season')::integer=g.season and x->>'season_type'='REG'
    and (x->>'week')::integer between greatest(1,g.week-3) and g.week-1
    and x->>'team_abbr' in (g.away_ngs,g.home_ngs)
   order by x->>'player_gsis_id',x->>'team_abbr',(x->>'week')::integer desc
  ) matched),'[]'::jsonb) as rows
  from latest s
 ) select jsonb_build_object('game_id',p_game_id,'datasets',coalesce(jsonb_agg(to_jsonb(datasets)),'[]'::jsonb)) from datasets;
$$;
