-- Best price across books for NHL and college basketball (owner, Oct 31 2026).
-- FanDuel stays the only book in sports_markets, so selections, grading, slates and publication are
-- unchanged. Other books' current quotes live here, one complete snapshot per game, book and market,
-- read by members only to name a better price for the identical line.
create table public.sports_book_quotes(
 id uuid primary key default gen_random_uuid(),
 game_id uuid not null references public.sports_games on delete cascade,
 book text not null check(book in ('DraftKings','BetMGM','Caesars','BetRivers','Fanatics')),
 market text not null check(market in ('h2h','spreads','totals','player_points','player_goals','player_goal_scorer_anytime')),
 observed_at timestamptz not null,
 payload jsonb not null check(jsonb_typeof(payload->'outcomes')='array' and jsonb_array_length(payload->'outcomes')<=400),
 fingerprint text not null unique,
 created_at timestamptz not null default now()
);
create index sports_book_quotes_game on public.sports_book_quotes(game_id,observed_at desc);
alter table public.sports_book_quotes enable row level security;
revoke all on public.sports_book_quotes from public,anon,authenticated;
grant select on public.sports_book_quotes to anon,authenticated;
grant all on public.sports_book_quotes to service_role;
create policy member_read on public.sports_book_quotes for select to anon,authenticated using((select private.has_membership()));
create policy age_verified_account on public.sports_book_quotes as restrictive for all to authenticated using((select private.age_member_allowed()));

-- Server-only ingest. Each snapshot is validated like a FanDuel market: a known upcoming game of the
-- batch's sport, an allowed book and market for that sport, a recent observation, sane prices.
create function private.ingest_sports_books(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; o jsonb; g public.sports_games; n integer:=0; v_sport text:=p->>'sport'; m text;
begin
 if v_sport not in ('nhl','ncaab') or v_sport is null or octet_length(p::text)>5000000 then raise exception 'Invalid sport batch';end if;
 for r in select value from jsonb_array_elements(coalesce(p->'snapshots','[]')) loop
  select * into g from public.sports_games where id=(r->>'game_id')::uuid and sports_games.sport=v_sport;
  if not found then raise exception 'Unknown quote game';end if; m:=r->>'market';
  if r->>'book' not in ('DraftKings','BetMGM','Caesars','BetRivers','Fanatics') or r->>'book' is null
   or (v_sport='ncaab' and coalesce(m,'') not in ('h2h','spreads'))
   or (v_sport='nhl' and coalesce(m,'') not in ('h2h','totals','player_points','player_goals','player_goal_scorer_anytime'))
   or g.start_time<=now() or r->>'observed_at' is null
   or (r->>'observed_at')::timestamptz>now()+interval '5 minutes' or (r->>'observed_at')::timestamptz<now()-interval '30 minutes'
   or jsonb_typeof(r->'outcomes') is distinct from 'array' or jsonb_array_length(r->'outcomes')>400
  then raise exception 'Invalid or stale book quote';end if;
  for o in select value from jsonb_array_elements(r->'outcomes') loop
   if jsonb_typeof(o->'price') is distinct from 'number' or (o->>'price')::numeric<>trunc((o->>'price')::numeric)
    or abs((o->>'price')::numeric)<100 or abs((o->>'price')::numeric)>100000 or coalesce(o->>'name','')=''
   then raise exception 'Invalid book price';end if;
  end loop;
  insert into public.sports_book_quotes(game_id,book,market,observed_at,payload,fingerprint)
  values(g.id,r->>'book',m,(r->>'observed_at')::timestamptz,
   jsonb_build_object('book',r->>'book','market',m,'outcomes',r->'outcomes'),
   encode(sha256(convert_to(jsonb_build_array(g.id,r->>'book',m,r->>'observed_at',r->'outcomes')::text,'UTF8')),'hex'))
  on conflict(fingerprint) do nothing;
  if found then n:=n+1;end if;
 end loop;
 -- Only the last hour competes for "Best"; keep a day for audits and drop the rest.
 delete from public.sports_book_quotes where observed_at<now()-interval '1 day';
 return jsonb_build_object('book_quotes_inserted',n);
end $$;
create function public.ingest_sports_books(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ingest_sports_books(p)$$;
revoke all on function private.ingest_sports_books(jsonb),public.ingest_sports_books(jsonb) from public,anon,authenticated;
grant execute on function private.ingest_sports_books(jsonb),public.ingest_sports_books(jsonb) to service_role;
