-- NBA shadow journal hardening (review of NBA-004, issue #65):
-- 1. record_nba_shadow_scan also checks the provider's quote time and the receipt time against the scan,
--    and requires the scan's hoopR input hashes and each forecast's history cutoff (before the game's
--    Eastern date). Missing evidence rejects the whole scan.
-- 2. nba_shadow_evaluation_rows takes the closing price from the same book's last snapshot of the market
--    before tip; a line missing from that snapshot (withdrawn or moved) has no closing price. A market the
--    book pulls entirely leaves no newer snapshot, so its last quote stands as the close.
-- Same signatures, so existing grants stay in place.

create or replace function private.record_nba_shadow_scan(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run uuid; r jsonb; o public.nba_observations; g public.nba_games; at timestamptz; inserted integer := 0; under integer;
 cutoff date;
begin
 if octet_length(p::text) > 3000000 or jsonb_array_length(coalesce(p->'forecasts','[]')) > 3000 then raise exception 'Scan too large'; end if;
 if not exists (select 1 from private.nba_shadow_models where model_id = p->>'model_id' and status = 'SHADOW_ONLY') then
  raise exception 'Unregistered NBA model'; end if;
 at := (p->>'generated_at')::timestamptz;
 if at is null or at > now() or at < now() - interval '15 minutes' then raise exception 'Scan is not current'; end if;
 if jsonb_typeof(p->'summary'->'inputs') is distinct from 'array' or jsonb_array_length(p->'summary'->'inputs') = 0
    or exists (select 1 from jsonb_array_elements(p->'summary'->'inputs') x
               where coalesce(x->>'sha256', '') !~ '^[0-9a-f]{64}$' or coalesce(x->>'file', '') = '') then
  raise exception 'Scan is missing its input hashes'; end if;
 insert into private.nba_shadow_runs(model_id, generated_at, summary) values(p->>'model_id', at, coalesce(p->'summary','{}'))
 on conflict(model_id, generated_at) do nothing returning id into run;
 if run is null then return jsonb_build_object('inserted', 0, 'replay', true); end if;
 for r in select value from jsonb_array_elements(coalesce(p->'forecasts','[]')) loop
  select * into o from public.nba_observations where id = (r->>'observation_id')::uuid and kind = 'prop';
  if not found then raise exception 'Unknown prop observation'; end if;
  select * into g from public.nba_games where id = o.game_id;
  if g.tipoff <= now() then raise exception 'Game has started'; end if;
  if o.recorded_at < now() - interval '30 minutes' then raise exception 'Price snapshot is stale'; end if;
  if o.recorded_at > at then raise exception 'Price snapshot was received after the scan'; end if;
  if o.observed_at is null then raise exception 'Price snapshot has no provider time'; end if;
  if o.observed_at > at or o.observed_at > o.recorded_at + interval '2 minutes' then
   raise exception 'Provider time is after the scan'; end if;
  if o.observed_at < at - interval '30 minutes' then raise exception 'Provider quote is stale'; end if;
  cutoff := case when coalesce(r->'forecast'->>'history_through', '') ~ '^\d{4}-\d{2}-\d{2}$'
   then (r->'forecast'->>'history_through')::date end;
  if cutoff is null or coalesce(r->'forecast'->>'history_games', '') !~ '^[1-9]\d*$' then
   raise exception 'Forecast is missing its history cutoff'; end if;
  if cutoff >= (g.tipoff at time zone 'America/New_York')::date then
   raise exception 'Forecast history reaches the game date'; end if;
  if r->>'market' is distinct from o.payload->>'market' then raise exception 'Market does not match the snapshot'; end if;
  if r->>'team' not in (g.away_team, g.home_team) then raise exception 'Team is not in this game'; end if;
  if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Over'
     and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'over_odds')::int) then
   raise exception 'Over price does not match the snapshot'; end if;
  under := null;
  if r ? 'under_odds' and jsonb_typeof(r->'under_odds') <> 'null' then
   if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Under'
      and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'under_odds')::int) then
    raise exception 'Under price does not match the snapshot'; end if;
   under := (r->>'under_odds')::int;
  end if;
  insert into private.nba_shadow_forecasts(run_id, model_id, game_id, observation_id, athlete_id, player, team, market, line, book,
   over_odds, under_odds, over_probability, no_vig_over, forecast, observed_at)
  values(run, p->>'model_id', g.id, o.id, r->>'athlete_id', r->>'player', r->>'team', r->>'market', (r->>'line')::numeric,
   o.payload->>'book', (r->>'over_odds')::int, under, (r->>'over_probability')::numeric,
   case when under is null then null else private.american_implied((r->>'over_odds')::int)
     / (private.american_implied((r->>'over_odds')::int) + private.american_implied(under)) end,
   coalesce(r->'forecast','{}'), o.observed_at)
  on conflict(model_id, observation_id, player, market, line) do nothing;
  if found then inserted := inserted + 1; end if;
 end loop;
 return jsonb_build_object('inserted', inserted, 'run_id', run);
end $$;

-- Forecasts for games that have started, with the Over grade from nba_grade and the closing price: the
-- same book's last snapshot of the market before tip-off, then that player's line in it (null if gone).
create or replace function private.nba_shadow_evaluation_rows(p_model text, p_after bigint default 0, p_limit integer default 1000)
returns table(id bigint, game_id uuid, tipoff timestamptz, observed_at timestamptz, athlete_id text, player text, team text,
 market text, line numeric, book text, over_odds integer, under_odds integer, over_probability numeric, no_vig_over numeric,
 result text, close_over_odds integer, close_under_odds integer, close_observed_at timestamptz)
language sql stable security definer set search_path='' as $$
 select f.id, f.game_id, g.tipoff, f.observed_at, f.athlete_id, f.player, f.team, f.market, f.line, f.book, f.over_odds, f.under_odds,
  f.over_probability, f.no_vig_over, public.nba_grade(f.game_id, f.market, 'Over', f.line, f.player),
  q.close_over, q.close_under, case when q.close_over is not null then coalesce(c.observed_at, c.recorded_at) end
 from private.nba_shadow_forecasts f
 join public.nba_games g on g.id = f.game_id
 left join lateral (
  select o.* from public.nba_observations o
  where o.game_id = f.game_id and o.kind = 'prop' and o.payload->>'book' = f.book and o.payload->>'market' = f.market
   and o.recorded_at < g.tipoff
  order by o.recorded_at desc limit 1) c on true
 left join lateral (
  select (select (x->>'price')::int from jsonb_array_elements(c.payload->'outcomes') x
           where x->>'name'='Over' and x->>'description'=f.player and (x->>'point')::numeric=f.line limit 1) close_over,
         (select (x->>'price')::int from jsonb_array_elements(c.payload->'outcomes') x
           where x->>'name'='Under' and x->>'description'=f.player and (x->>'point')::numeric=f.line limit 1) close_under) q on true
 where f.model_id = p_model and f.id > p_after and g.tipoff < now()
 order by f.id limit least(greatest(p_limit, 1), 1000)
$$;
