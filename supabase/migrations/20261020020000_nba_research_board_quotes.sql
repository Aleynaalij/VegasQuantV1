-- Review follow-up to 20261020010000 (#88): the quote behind a research leg must be the latest snapshot of
-- that game, book and market (an older, better price can no longer be published after the market moved
-- or withdrew the line), and freshness is judged by the provider's own quote time (observed_at, the
-- book's last update), not only by when we received it. The four opening-night legs already met both.
create or replace function private.publish_nba_research_leg(p jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare g public.nba_games; o public.nba_observations; price int; line numeric; vals numeric[]; v numeric; cleared int := 0;
 med numeric; be numeric; first_price int; new_id bigint; h jsonb;
begin
 select * into o from public.nba_observations where nba_observations.id = (p->>'observation_id')::uuid and kind = 'prop';
 if not found then raise exception 'Unknown prop observation'; end if;
 select * into g from public.nba_games where nba_games.id = o.game_id;
 if g.season_type is distinct from 2 or g.tipoff_tbd or g.tipoff <= now() then raise exception 'Not an upcoming regular-season game'; end if;
 if o.observed_at is null or o.observed_at > now() + interval '2 minutes' or o.observed_at < now() - interval '8 hours'
    or o.recorded_at < now() - interval '8 hours' then raise exception 'Price snapshot is older than 8 hours or has no provider time'; end if;
 if exists (select 1 from public.nba_observations n where n.game_id = o.game_id and n.kind = 'prop'
    and n.payload->>'book' = o.payload->>'book' and n.payload->>'market' = o.payload->>'market' and n.recorded_at > o.recorded_at) then
  raise exception 'A newer snapshot of this market exists; publish from the latest quote'; end if;
 if p->>'market' is distinct from o.payload->>'market' or p->>'book' is distinct from o.payload->>'book' then
  raise exception 'Market or book does not match the snapshot'; end if;
 price := (p->>'odds')::int; line := (p->>'line')::numeric;
 if price not between -249 and -150 then raise exception 'Price is outside -150 to -249'; end if;
 if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Over'
   and x->>'description' = p->>'player' and (x->>'point')::numeric = line and (x->>'price')::int = price) then
  raise exception 'Price does not match the snapshot'; end if;
 select (x->>'price')::int into first_price from public.nba_observations f, jsonb_array_elements(f.payload->'outcomes') x
 where f.game_id = o.game_id and f.kind = 'prop' and f.payload->>'book' = o.payload->>'book' and f.payload->>'market' = o.payload->>'market'
   and x->>'name' = 'Over' and x->>'description' = p->>'player' and (x->>'point')::numeric = line
 order by f.recorded_at limit 1;
 if price - first_price >= 15 then raise exception 'Price moved 15+ cents against the selection since its first quote'; end if;
 if jsonb_typeof(p->'history') is distinct from 'array' or jsonb_array_length(p->'history') < 5 then
  raise exception 'At least five games of history are required'; end if;
 for h in select value from jsonb_array_elements(p->'history') loop
  if jsonb_typeof(h->'value') <> 'number' or coalesce(h->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or (h->>'date')::date >= (g.tipoff at time zone 'America/New_York')::date then
   raise exception 'Each history game needs a numeric value and a date before the game'; end if;
  v := (h->>'value')::numeric; vals := vals || v;
  if v > line then cleared := cleared + 1; end if;
 end loop;
 select percentile_cont(0.5) within group (order by x) into med from unnest(vals) x;
 be := 100.0 * abs(price) / (abs(price) + 100);
 if 100.0 * cleared / array_length(vals, 1) < be + 5 then raise exception 'Recent clear rate does not beat break-even by 5 points'; end if;
 if med <= line then raise exception 'Recent median does not clear the line'; end if;
 insert into public.nba_research_legs(game_id, observation_id, player, market, line, book, odds, quote_observed_at, history, cleared, sample,
  median, break_even, edge_points, why, risk, sources, expires_at)
 values(g.id, o.id, p->>'player', p->>'market', line, p->>'book', price, coalesce(o.observed_at, o.recorded_at), p->'history', cleared,
  array_length(vals, 1), med, round(be, 1), round(100.0 * cleared / array_length(vals, 1) - be, 1), p->>'why', p->>'risk',
  coalesce(p->'sources', '[]'), g.tipoff)
 returning nba_research_legs.id into new_id;
 return new_id;
end $$;
revoke all on function private.publish_nba_research_leg(jsonb) from public, anon, authenticated, service_role;
grant execute on function private.publish_nba_research_leg(jsonb) to service_role;
