-- Scorecard fixes from review (#136): score the current corrected outcome (corrections and voids
-- via private.nfl_shadow_current_outcome), rank only eligible main-line forecasts so an alternate
-- can't hide a main-line one, and treat pushes like the market's no-vig price does: drop pushed
-- outcomes and compare the model's win probability conditional on no push.
create or replace function private.nfl_shadow_scored_props()
returns table(market text, week integer, game_id uuid, p numeric, m numeric, hit integer)
language sql stable security definer set search_path='' as $$
  with eligible as (
    select f.id, f.game_id, f.player, f.market, f.line, f.direction, f.recorded_at,
      (f.forecast->>'research_probability')::numeric p_raw,
      coalesce((f.forecast->>'push_probability')::numeric, 0) push,
      (f.forecast->>'no_vig_market_probability')::numeric m,
      (f.forecast->'quote'->>'week')::integer week
    from private.nfl_shadow_forecasts f
    join public.games g on g.id = f.game_id
    where f.direction = 'over' and f.recorded_at < g.kickoff
      and coalesce(f.forecast->'quote'->>'provider_market', '') not ilike '%alternate%'
      and f.forecast->>'research_probability' is not null
      and f.forecast->>'no_vig_market_probability' is not null
  ), ranked as (
    select e.*, row_number() over (
      partition by e.game_id, e.player, e.market, e.line, e.direction
      order by e.recorded_at desc, e.id desc
    ) rn
    from eligible e
  )
  select r.market, r.week, r.game_id, r.p_raw / (1 - r.push), r.m,
    case when o.yards > r.line then 1 else 0 end
  from ranked r
  cross join lateral private.nfl_shadow_current_outcome(r.id) o
  where r.rn = 1 and r.push < 1 and not coalesce(o.void, true)
    and o.yards is not null and o.yards <> r.line;
$$;
revoke all on function private.nfl_shadow_scored_props() from public, anon, authenticated, service_role;
