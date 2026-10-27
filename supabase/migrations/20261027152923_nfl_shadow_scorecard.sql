-- Admin-only scorecard for the v0.3 NFL shadow model against the market (#65): read-only over the
-- existing shadow journal. One row per prop: the last forecast recorded before kickoff, main lines
-- only (no alternates), priced with a no-vig market probability, over side only so an over/under
-- pair is never counted twice. Uncertainty is clustered by game, since props in one game move
-- together. This scores the model; it approves nothing and changes no forecast, pick or ledger.

create function private.nfl_shadow_scored_props()
returns table(market text, week integer, game_id uuid, p numeric, m numeric, hit integer)
language sql stable security definer set search_path='' as $$
  with latest as (
    select f.game_id, f.market, f.line, o.yards,
      (f.forecast->>'research_probability')::numeric p,
      (f.forecast->>'no_vig_market_probability')::numeric m,
      (f.forecast->'quote'->>'week')::integer week,
      f.forecast->'quote'->>'provider_market' provider_market,
      f.recorded_at, (f.forecast->'quote'->>'kickoff')::timestamptz kickoff,
      row_number() over (
        partition by f.game_id, f.player, f.market, f.line, f.direction
        order by f.recorded_at desc
      ) rn
    from private.nfl_shadow_forecasts f
    join private.nfl_shadow_outcomes o on o.forecast_id = f.id and not o.void
    where f.direction = 'over'
  )
  select market, week, game_id, p, m, case when yards > line then 1 else 0 end
  from latest
  where rn = 1 and recorded_at < kickoff and p is not null and m is not null
    and coalesce(provider_market, '') not ilike '%alternate%';
$$;
revoke all on function private.nfl_shadow_scored_props() from public, anon, authenticated, service_role;

create function private.admin_nfl_shadow_scorecard()
returns table(market text, week integer, props integer, games integer, hit_rate numeric,
  brier_model numeric, brier_market numeric, brier_diff numeric, brier_diff_se numeric,
  logloss_model numeric, logloss_market numeric, disagree_props integer, disagree_model_right numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Verified administrator required' using errcode = '42501'; end if;
  return query
  with s as (
    select x.market, x.week, x.game_id, x.p, x.m, x.hit,
      power(x.p - x.hit, 2) - power(x.m - x.hit, 2) d
    from private.nfl_shadow_scored_props() x
  ), grouped as (
    -- Each market by week, and each market over all weeks (week null).
    select s.market, s.week, s.game_id, s.p, s.m, s.hit, s.d from s
    union all
    select s.market, null, s.game_id, s.p, s.m, s.hit, s.d from s
  ), per_game as (
    select g.market, g.week, g.game_id, count(*) n, sum(g.d) dsum
    from grouped g group by g.market, g.week, g.game_id
  ), se as (
    -- Game-clustered standard error of the mean Brier difference.
    select pg.market, pg.week,
      case when count(*) > 1 then
        sqrt(count(*)::numeric / (count(*) - 1)
          * sum(power(pg.dsum - pg.n * t.dbar, 2))) / sum(pg.n)
      end v
    from per_game pg
    join (select g.market, g.week, avg(g.d) dbar from grouped g group by g.market, g.week) t
      on t.market = pg.market and t.week is not distinct from pg.week
    group by pg.market, pg.week
  )
  select g.market, g.week, count(*)::integer, count(distinct g.game_id)::integer,
    round(avg(g.hit), 3),
    round(avg(power(g.p - g.hit, 2)), 4), round(avg(power(g.m - g.hit, 2)), 4),
    round(avg(g.d), 4), round(max(se.v), 4),
    round(avg(-(g.hit * ln(greatest(g.p, 1e-6)) + (1 - g.hit) * ln(greatest(1 - g.p, 1e-6)))), 4),
    round(avg(-(g.hit * ln(greatest(g.m, 1e-6)) + (1 - g.hit) * ln(greatest(1 - g.m, 1e-6)))), 4),
    (count(*) filter (where abs(g.p - g.m) >= 0.10))::integer,
    round(avg(case when abs(g.p - g.m) >= 0.10 then
      case when (g.p > g.m) = (g.hit = 1) then 1 else 0 end end), 3)
  from grouped g
  join se on se.market = g.market and se.week is not distinct from g.week
  group by g.market, g.week
  order by g.market, g.week nulls last;
end $$;
revoke all on function private.admin_nfl_shadow_scorecard() from public, anon, service_role;
grant execute on function private.admin_nfl_shadow_scorecard() to authenticated;

create function private.admin_nfl_shadow_calibration()
returns table(market text, bin integer, props integer, mean_model numeric, mean_market numeric, hit_rate numeric)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_admin() then raise exception 'Verified administrator required' using errcode = '42501'; end if;
  return query
  select x.market, least(floor(x.p * 10)::integer, 9), count(*)::integer,
    round(avg(x.p), 3), round(avg(x.m), 3), round(avg(x.hit), 3)
  from private.nfl_shadow_scored_props() x
  group by 1, 2 order by 1, 2;
end $$;
revoke all on function private.admin_nfl_shadow_calibration() from public, anon, service_role;
grant execute on function private.admin_nfl_shadow_calibration() to authenticated;

create function public.admin_nfl_shadow_scorecard()
returns table(market text, week integer, props integer, games integer, hit_rate numeric,
  brier_model numeric, brier_market numeric, brier_diff numeric, brier_diff_se numeric,
  logloss_model numeric, logloss_market numeric, disagree_props integer, disagree_model_right numeric)
language sql stable security invoker set search_path='' as $$ select * from private.admin_nfl_shadow_scorecard(); $$;
revoke all on function public.admin_nfl_shadow_scorecard() from public, anon;
grant execute on function public.admin_nfl_shadow_scorecard() to authenticated;

create function public.admin_nfl_shadow_calibration()
returns table(market text, bin integer, props integer, mean_model numeric, mean_market numeric, hit_rate numeric)
language sql stable security invoker set search_path='' as $$ select * from private.admin_nfl_shadow_calibration(); $$;
revoke all on function public.admin_nfl_shadow_calibration() from public, anon;
grant execute on function public.admin_nfl_shadow_calibration() to authenticated;
