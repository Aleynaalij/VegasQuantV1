-- Price-move alerts: when the market price of a published leg moves 15 cents or more from the price
-- it was published at, before kickoff, everyone who tailed or saved that leg gets one push. Each leg
-- alerts at most once per direction ('against': the price drifted away from the pick, rule R7;
-- 'toward': the market moved with the pick). Uses the existing price alert delivery ('price' kind).
create table private.leg_move_alerts(
 leg_key text not null,
 direction text not null check(direction in ('against','toward')),
 from_price numeric not null,
 to_price numeric not null,
 alerted_at timestamptz not null default now(),
 primary key(leg_key, direction)
);
alter table private.leg_move_alerts enable row level security;
revoke all on private.leg_move_alerts from public, anon, authenticated, service_role;

create function private.enqueue_price_move_push() returns trigger
language plpgsql security definer set search_path = '' as $$
declare base numeric; original text; move numeric; dir text; release text;
begin
 if new.last_price is not distinct from old.last_price or now() >= new.kickoff
  or new.last_observed_at >= new.kickoff or new.last_point is distinct from new.first_point then
  return new;
 end if;
 -- The published price; the first tracked price when the pick went out without one.
 select l.odds, l.original_leg_key into base, original from public.published_legs l where l.leg_key = new.leg_key limit 1;
 base := coalesce(base, new.first_price);
 if base is null or abs(base) < 100 then return new; end if;
 -- American odds on a straight "cents" scale, so -110 to +110 is 20 cents.
 move := (case when new.last_price < 0 then new.last_price + 100 else new.last_price - 100 end)
       - (case when base < 0 then base + 100 else base - 100 end);
 dir := case when move >= 15 then 'against' when move <= -15 then 'toward' end;
 if dir is null then return new; end if;
 release := split_part(new.leg_key, ':', 2);
 if release !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return new; end if;
 insert into private.leg_move_alerts(leg_key, direction, from_price, to_price)
  values(new.leg_key, dir, base, new.last_price) on conflict do nothing;
 if not found then return new; end if;
 insert into private.push_deliveries(subscription_id, kind, event_key, next_at)
 select s.id, 'price', 'price:' || lower(release) || ':move:' || dir || ':' || trim_scale(base)::text || ':' || trim_scale(new.last_price)::text, now()
   from public.push_subscriptions s
  where s.user_id in (
   select t.user_id from public.leg_tails t where t.leg_key = new.leg_key or t.leg_key = original
   union
   select v.user_id from public.saved_legs v where v.leg_key = new.leg_key or v.leg_key = original);
 return new;
exception when others then
 raise warning 'Price move alert could not be queued';
 return new;
end $$;
revoke all on function private.enqueue_price_move_push() from public, anon, authenticated, service_role;
create trigger enqueue_price_move_push after update on public.leg_market_prices
 for each row execute function private.enqueue_price_move_push();
