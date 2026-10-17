-- Review follow-up to 20261018040000: evaluation rows include every captured forecast, graded or
-- not, so a dossier reports the forecasts still waiting on an outcome instead of scoring only the
-- graded subset.
drop function public.nfl_shadow_evaluation_rows(text);
create function public.nfl_shadow_evaluation_rows(p_model_id text) returns table(
 forecast_id uuid, game_id uuid, kickoff timestamptz, recorded_at timestamptz, player_id text, player_position text,
 market text, direction text, line numeric, odds numeric, research_probability numeric, push_probability numeric,
 no_vig_probability numeric, estimated_edge_pp numeric, graded boolean, finished boolean, yards numeric, void boolean,
 closing_odds numeric)
language sql stable security definer set search_path='' as $$
 select f.id, f.game_id, g.kickoff, f.recorded_at, f.forecast->'quote'->>'player_id', f.forecast->>'position',
  f.market, f.direction, f.line, (f.forecast->'quote'->>'odds')::numeric, (f.forecast->>'research_probability')::numeric,
  (f.forecast->>'push_probability')::numeric, (f.forecast->>'no_vig_market_probability')::numeric,
  (f.forecast->>'estimated_edge_pp')::numeric, o.forecast_id is not null, g.kickoff < now() - interval '6 hours',
  o.yards, o.void,
  (select (oc->>'price')::numeric from public.source_observations c, jsonb_array_elements(c.payload->'outcomes') oc
    where c.game_id=f.game_id and c.kind='odds' and c.payload->>'book'='FanDuel'
      and c.payload->>'market'=f.forecast->'quote'->>'provider_market' and c.observed_at < g.kickoff
      and c.observed_at = (select max(c2.observed_at) from public.source_observations c2 where c2.game_id=f.game_id and c2.kind='odds'
         and c2.payload->>'book'='FanDuel' and c2.payload->>'market'=f.forecast->'quote'->>'provider_market' and c2.observed_at < g.kickoff)
      and oc->>'description'=f.player and lower(oc->>'name')=f.direction and (oc->>'point')::numeric=f.line
    limit 1)
 from private.nfl_shadow_forecasts f join public.games g on g.id=f.game_id
 left join private.nfl_shadow_outcomes o on o.forecast_id=f.id
 where f.model_id=p_model_id
$$;
revoke all on function public.nfl_shadow_evaluation_rows(text) from public, anon, authenticated;
grant execute on function public.nfl_shadow_evaluation_rows(text) to service_role;
