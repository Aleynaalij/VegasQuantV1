-- Private research inputs. Additive only: no changes to published picks or bankroll logic.
create table public.intelligence_markets (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id),
 market_key text not null check(length(trim(market_key)) between 1 and 120),
 label text not null check(length(trim(label)) between 1 and 200),
 market_type text not null check(market_type in ('Side','Moneyline','Total','Player Prop')),
 selection text not null check(length(trim(selection)) between 1 and 200),
 opposite text not null check(length(trim(opposite)) between 1 and 200),
 period text not null default 'Full game' check(length(trim(period)) between 1 and 100),
 rules text not null check(length(trim(rules)) between 1 and 2000),
 official_pick_id uuid unique references public.official_picks(id),
 created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 unique(game_id,market_key), check(selection<>opposite)
);
create table public.intelligence_quotes (
 id uuid primary key default gen_random_uuid(), market_id uuid not null references public.intelligence_markets(id),
 book text not null check(length(trim(book)) between 1 and 100), line numeric check(line between -100000 and 100000),
 odds numeric not null check(abs(odds) between 100 and 100000), opposite_odds numeric check(abs(opposite_odds) between 100 and 100000),
 observed_at timestamptz not null check(isfinite(observed_at) and observed_at<=now()+interval '5 minutes'),
 time_basis text not null default 'observed' check(time_basis in ('observed','received','published')),
 source text not null check(length(trim(source)) between 1 and 2000), notes text not null default '' check(length(notes)<=10000),
 created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table public.intelligence_splits (
 id uuid primary key default gen_random_uuid(), market_id uuid not null references public.intelligence_markets(id),
 book text not null check(length(trim(book)) between 1 and 100), line numeric check(line between -100000 and 100000),
 ticket_pct numeric check(ticket_pct between 0 and 100), handle_pct numeric check(handle_pct between 0 and 100),
 sample_size integer check(sample_size>0), sample_window text not null check(length(trim(sample_window)) between 1 and 500),
 observed_at timestamptz not null check(isfinite(observed_at) and observed_at<=now()+interval '5 minutes'),
 time_basis text not null default 'observed' check(time_basis in ('observed','received','published')),
 source text not null check(length(trim(source)) between 1 and 2000), notes text not null default '' check(length(notes)<=10000),
 created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 check(ticket_pct is not null or handle_pct is not null)
);
create table public.intelligence_news (
 id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id),
 category text not null check(category in ('Injury','Weather','Team','Other')),
 headline text not null check(length(trim(headline)) between 1 and 300), body text not null check(length(trim(body)) between 1 and 20000),
 observed_at timestamptz not null check(isfinite(observed_at) and observed_at<=now()+interval '5 minutes'),
 time_basis text not null default 'published' check(time_basis in ('observed','received','published')),
 source text not null check(length(trim(source)) between 1 and 2000),
 created_at timestamptz not null default now(), created_by uuid default auth.uid()
);
create table public.intelligence_models (
 id uuid primary key default gen_random_uuid(), market_id uuid not null references public.intelligence_markets(id),
 true_line numeric check(true_line between -100000 and 100000), projection text not null check(length(trim(projection)) between 1 and 2000),
 probability numeric check(probability between 0 and 100), probability_line numeric check(probability_line between -100000 and 100000),
 sharp_fair_line numeric check(sharp_fair_line between -100000 and 100000), sharp_method text,
 observed_at timestamptz not null check(isfinite(observed_at) and observed_at<=now()+interval '5 minutes'),
 source text not null check(length(trim(source)) between 1 and 2000), notes text not null default '' check(length(notes)<=10000),
 created_at timestamptz not null default now(), created_by uuid default auth.uid(),
 check(sharp_fair_line is null or coalesce(length(trim(sharp_method)),0)>0)
);
-- Query indexes support game/market filters and stable reverse-chronological paging.
create index intelligence_quotes_tape on public.intelligence_quotes(market_id,observed_at desc,id desc);
create index intelligence_quotes_book on public.intelligence_quotes(market_id,book,observed_at desc);
create index intelligence_splits_tape on public.intelligence_splits(market_id,observed_at desc,id desc);
create index intelligence_news_tape on public.intelligence_news(game_id,observed_at desc,id desc);
create index intelligence_models_tape on public.intelligence_models(market_id,observed_at desc,id desc);
create function private.stamp_intelligence() returns trigger language plpgsql set search_path='' as $$
begin
 new.created_at=clock_timestamp(); new.created_by=auth.uid();
 if tg_table_name in ('intelligence_quotes','intelligence_splits') then
  if (select market_type='Moneyline' from public.intelligence_markets where id=new.market_id) is distinct from (new.line is null) then
   raise exception 'Moneylines require an empty line; sides, totals and props require a line';
  end if;
 end if;
 return new;
end $$;
revoke all on function private.stamp_intelligence() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['intelligence_markets','intelligence_quotes','intelligence_splits','intelligence_news','intelligence_models'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert on public.%I to authenticated',t);
  execute format('create policy verified_admin_read on public.%I for select to authenticated using ((select private.is_admin()))',t);
  execute format('create policy verified_admin_append on public.%I for insert to authenticated with check ((select private.is_admin()) and created_by=(select auth.uid()))',t);
  execute format('create trigger intelligence_stamp before insert on public.%I for each row execute function private.stamp_intelligence()',t);
  execute format('create trigger intelligence_immutable before update or delete on public.%I for each row execute function private.immutable()',t);
 end loop;
end $$;
-- Import only the explicitly supplied historical FD/DK quotes. Receipt time is NOT an observation time.
do $$ declare p record; m uuid; q jsonb; begin
 for p in select * from public.official_picks where selection='Jaylen Warren Over 22.5 Receiving Yards' and jsonb_typeof(known_at_publication->'comparison_quotes')='array' loop
  insert into public.intelligence_markets(game_id,market_key,label,market_type,selection,opposite,rules,official_pick_id)
  values(p.game_id,'warren-receiving-yards','Jaylen Warren receiving yards','Player Prop','Over','Under','Owner-reported market. Sportsbook-specific settlement rules not independently verified.',p.id) returning id into m;
  for q in select value from jsonb_array_elements(p.known_at_publication->'comparison_quotes') loop
   if q->>'book' in ('FanDuel','DraftKings') then
    insert into public.intelligence_quotes(market_id,book,line,odds,observed_at,time_basis,source,notes)
    values(m,q->>'book',(q->>'line')::numeric,(q->>'odds')::numeric,(q->>'received_at')::timestamptz,'received',q->>'source','Historical owner screenshot; exact quote observation time and opposite price not supplied. Not directly verified with the sportsbook.');
   end if;
  end loop;
  insert into public.intelligence_models(market_id,projection,probability,probability_line,observed_at,source,notes)
  values(m,'29-31 receiving yards',p.model_probability,p.recommended_line,p.created_at,'Vegas Quant Ultra / original official handoff','Projection range retained exactly. No point estimate or sharp fair line supplied.');
  insert into public.intelligence_news(game_id,category,headline,body,observed_at,time_basis,source)
  select p.game_id,'Injury','Official analyst injury update',a.sections->>'Injuries',a.created_at,'published',a.source from public.analysis_versions a where a.id=p.analysis_id and nullif(a.sections->>'Injuries','') is not null;
 end loop;
end $$;
