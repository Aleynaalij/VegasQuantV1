-- FanDuel market prices for published, gradable picks, matched by result-sync from The Odds API
-- prop observations (exact line only). first_* is the first price seen and never changes; last_*
-- follows the market until kickoff, so after kickoff it is the closing price.
create table public.leg_market_prices(
 leg_key text primary key references private.leg_result_contracts(leg_key),
 book text not null,
 first_price numeric not null check(abs(first_price) >= 100),
 first_point numeric not null,
 first_observed_at timestamptz not null,
 last_price numeric not null check(abs(last_price) >= 100),
 last_point numeric not null,
 last_observed_at timestamptz not null,
 kickoff timestamptz not null,
 updated_at timestamptz not null default now(),
 check(last_observed_at <= kickoff + interval '5 minutes')
);
alter table public.leg_market_prices enable row level security;
grant select on public.leg_market_prices to authenticated;
create policy market_price_read on public.leg_market_prices for select to authenticated
 using((select private.has_membership()) and (select private.age_member_allowed()));
grant select, insert, update on public.leg_market_prices to service_role;
-- first_* is the record of what the market first offered; only the latest price may move.
create function private.keep_first_market_price() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.leg_key, new.book, new.first_price, new.first_point, new.first_observed_at)
  is distinct from (old.leg_key, old.book, old.first_price, old.first_point, old.first_observed_at) then
  raise exception 'First market price is immutable';
 end if;
 return new;
end $$;
create trigger keep_first_market_price before update on public.leg_market_prices
 for each row execute function private.keep_first_market_price();

-- result-sync reads prop observations; source-sync asks which games have gradable picks.
grant select on public.source_observations to service_role;
create function public.priced_pick_games(p_hours integer) returns table(game_id uuid)
language sql stable security definer set search_path='' as $$
 select distinct c.game_id from private.leg_result_contracts c join public.games g on g.id = c.game_id
 where g.kickoff > now() and g.kickoff <= now() + make_interval(hours => least(greatest(p_hours, 1), 72));
$$;
revoke all on function public.priced_pick_games(integer) from public, anon, authenticated;
grant execute on function public.priced_pick_games(integer) to service_role;
