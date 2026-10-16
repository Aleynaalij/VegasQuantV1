-- Line shopping (owner decision, October 16, 2026): the FanDuel-only rule is retired. The feed
-- collects every major US book; a selection may be published at any collected book's exact price.
-- Every proof requirement is unchanged, but follows the selection's own book instead of FanDuel:
-- the quote, the initial price, newer snapshots and the 15-cent drift check all come from the book
-- the price is published at, so prices from different books are never mixed.
do $$ declare original text; changed text; pattern text; replacement text; begin
 original:=pg_get_functiondef('private.nfl_selection_errors(jsonb,jsonb,timestamptz)'::regprocedure);
 changed:=original;
 for pattern, replacement in values
  ($p$coalesce(c->>'book','')<>'FanDuel'$p$, $p$coalesce(trim(c->>'book'),'')=''$p$),
  ($p$R8: exact numeric FanDuel American price required$p$, $p$R8: exact numeric American price and named sportsbook required$p$),
  ($p$initial_q.payload->>'book' is distinct from 'FanDuel'$p$, $p$initial_q.payload->>'book' is distinct from q.payload->>'book'$p$),
  -- After the initial-quote pattern, which also contains this text.
  ($p$q.payload->>'book' is distinct from 'FanDuel'$p$, $p$q.payload->>'book' is distinct from c->>'book'$p$),
  ($p$R8: fresh immutable exact-market FanDuel observation and quote provenance required$p$, $p$R8: fresh immutable exact-market observation from the published sportsbook and quote provenance required$p$),
  ($p$newer.payload->>'book'='FanDuel'$p$, $p$newer.payload->>'book'=q.payload->>'book'$p$),
  ($p$earlier.payload->>'book'='FanDuel'$p$, $p$earlier.payload->>'book'=q.payload->>'book'$p$)
 loop
  if strpos(changed, pattern)=0 then raise exception 'Expected selection gate pattern not found: %', pattern; end if;
  changed:=replace(changed, pattern, replacement);
 end loop;
 if strpos(changed, '''FanDuel''')>0 then raise exception 'Selection gate still pins FanDuel'; end if;
 execute changed;
end $$;

-- Latest exact-line price at every collected book for each published, gradable pick, refreshed by
-- result-sync until kickoff. Members see it for "best price" on leg cards; leg_market_prices keeps
-- the published book's first and closing price for the record.
create table public.leg_book_prices(
 leg_key text not null references private.leg_result_contracts(leg_key),
 book text not null check(length(trim(book))>0),
 price numeric not null check(abs(price) >= 100),
 point numeric not null,
 observed_at timestamptz not null,
 kickoff timestamptz not null,
 updated_at timestamptz not null default now(),
 primary key(leg_key, book),
 check(observed_at <= kickoff + interval '5 minutes')
);
alter table public.leg_book_prices enable row level security;
grant select on public.leg_book_prices to authenticated;
create policy leg_book_prices_read on public.leg_book_prices for select to authenticated
 using((select private.has_membership()) and (select private.age_member_allowed()));
grant select, insert, update on public.leg_book_prices to service_role;
