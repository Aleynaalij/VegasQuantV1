-- NBA research board (owner request, Oct 20 2026): labeled research legs in the NBA Zone, the basketball
-- counterpart of the NFL research tier (20261017000000). A research leg is never an official pick: no
-- validated model edge is claimed, and it has its own record that never mixes with NFL results.
--
-- Legs enter only through private.publish_nba_research_leg (service role), which applies the standing
-- rules by analogy to the NFL bible:
--  * an upcoming, confirmed regular-season game; the leg expires at tip-off;
--  * a points or rebounds Over at a half-point line, priced -150 to -249 (R2), quoted at exactly that
--    price in a stored prop snapshot of that book, game, player and line received within 8 hours (R8);
--    the first stored quote of that selection must not be 15+ cents shorter than the price (R7);
--  * the player's latest five or more games, recomputed here: clear rate at least break-even + 5 points
--    (R1) and a median above the line;
--  * why, risk and sources; one leg per game, player and market.
-- The game history is supplied evidence: SQL cannot authenticate an external box score, so its source
-- URL is stored with it. Legs are graded by nba_grade on recorded box scores.
create table public.nba_research_legs(
 id bigint generated always as identity primary key,
 game_id uuid not null references public.nba_games(id),
 observation_id uuid not null references public.nba_observations(id),
 player text not null,
 market text not null check(market in ('player_points', 'player_rebounds')),
 line numeric not null check(line > 0 and line * 2 = round(line * 2) and line <> trunc(line)),
 book text not null,
 odds integer not null check(odds between -249 and -150),
 quote_observed_at timestamptz not null,
 history jsonb not null check(jsonb_typeof(history) = 'array'),
 cleared integer not null, sample integer not null check(sample >= 5), median numeric not null,
 break_even numeric not null, edge_points numeric not null check(edge_points >= 5),
 why text not null check(length(trim(why)) > 0), risk text not null check(length(trim(risk)) > 0),
 sources jsonb not null check(jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
 published_at timestamptz not null default now(),
 expires_at timestamptz not null,
 unique(game_id, player, market)
);
create index nba_research_legs_game_idx on public.nba_research_legs(game_id);
create trigger immutable_nba_research_leg before update or delete on public.nba_research_legs for each row execute function private.immutable();
alter table public.nba_research_legs enable row level security;
create policy member_read on public.nba_research_legs for select to anon, authenticated using ((select private.has_membership()));
create policy age_verified_account on public.nba_research_legs as restrictive for all to authenticated using ((select private.age_member_allowed()));
revoke all on public.nba_research_legs from public, anon, authenticated;
grant select on public.nba_research_legs to anon, authenticated, service_role;

create or replace function private.publish_nba_research_leg(p jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare g public.nba_games; o public.nba_observations; price int; line numeric; vals numeric[]; v numeric; cleared int := 0;
 med numeric; be numeric; first_price int; new_id bigint; h jsonb;
begin
 select * into o from public.nba_observations where nba_observations.id = (p->>'observation_id')::uuid and kind = 'prop';
 if not found then raise exception 'Unknown prop observation'; end if;
 select * into g from public.nba_games where nba_games.id = o.game_id;
 if g.season_type is distinct from 2 or g.tipoff_tbd or g.tipoff <= now() then raise exception 'Not an upcoming regular-season game'; end if;
 if o.recorded_at < now() - interval '8 hours' then raise exception 'Price snapshot is older than 8 hours'; end if;
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

-- Research legs with their grade (WIN/LOSS/PUSH/VOID/PENDING/REVIEW) from recorded box scores.
create view public.nba_research_results with (security_invoker = true) as
 select l.*, g.away_team, g.home_team, g.tipoff, g.slug, public.nba_grade(l.game_id, l.market, 'Over', l.line, l.player) result
 from public.nba_research_legs l join public.nba_games g on g.id = l.game_id;
grant select on public.nba_research_results to anon, authenticated, service_role;
