-- NBA picks must cite The NBA Betting Bible rules (R-01 to R-40).
-- Games gain a sport; every existing game is NFL. Official picks gain rule_ids, filled from the
-- case/risk text when not supplied, and an NBA pick without a citation is rejected.

alter table public.games
  add column sport text not null default 'nfl' check (sport in ('nfl', 'nba'));

alter table public.official_picks
  add column rule_ids text[] not null default '{}'
  check (array_to_string(rule_ids, ',') ~ '^(R-(0[1-9]|[1-3][0-9]|40)(,R-(0[1-9]|[1-3][0-9]|40))*)?$');

comment on column public.official_picks.rule_ids is
  'NBA Betting Bible rules cited by this pick, e.g. {R-01,R-07}. Filled from why_like/why_lose when empty. Required for NBA games.';

create function private.cite_bible_rules() returns trigger
language plpgsql set search_path = '' as $$
declare
  game_sport text;
begin
  if cardinality(new.rule_ids) = 0 then
    select coalesce(array_agg(q.id order by q.first_at), '{}') into new.rule_ids
    from (
      select m[1] as id, min(x.ord) as first_at
      from regexp_matches(coalesce(new.why_like, '') || ' ' || coalesce(new.why_lose, ''),
                          '\m(R-(?:0[1-9]|[1-3][0-9]|40))\M', 'g') with ordinality as x(m, ord)
      group by m[1]
    ) q;
  end if;
  select g.sport into game_sport from public.games g where g.id = new.game_id;
  if game_sport = 'nba' and cardinality(new.rule_ids) = 0 then
    raise exception 'NBA picks must cite at least one NBA Betting Bible rule (R-01 to R-40) in the case or the risks';
  end if;
  return new;
end $$;

revoke all on function private.cite_bible_rules() from public;

create trigger official_picks_cite_bible_rules
  before insert on public.official_picks
  for each row execute function private.cite_bible_rules();
