-- Owner requested early NBA editorial publication on October 19, 2026.
-- Separate from NFL releases, official picks, model forecasts and result grading.
create table public.nba_editorial_picks (
 id uuid primary key default gen_random_uuid(),
 publication_key text not null unique check(length(publication_key) between 1 and 180),
 game_id uuid not null references public.nba_games(id),
 quote_observation_id uuid not null references public.nba_observations(id),
 player text not null check(length(player) between 1 and 100),
 market text not null check(market in ('player_points','player_rebounds')),
 direction text not null check(direction in ('Over','Under')),
 line numeric not null check(line>=0 and line<200),
 odds integer not null check(abs(odds)>=100 and abs(odds)<=100000),
 book text not null check(book='FanDuel'),
 analysis_kind text not null default 'QUALITATIVE_EDITORIAL' check(analysis_kind='QUALITATIVE_EDITORIAL'),
 rationale text not null check(length(rationale) between 30 and 1500),
 risk text not null check(length(risk) between 20 and 1500),
 unknowns text not null check(length(unknowns) between 10 and 1500),
 sources jsonb not null check(jsonb_typeof(sources)='array' and jsonb_array_length(sources)>=2),
 evidence jsonb not null check(jsonb_typeof(evidence)='object'),
 supersedes_id uuid references public.nba_editorial_picks(id),
 published_at timestamptz not null default now(),
 expires_at timestamptz not null,
 quote_observed_at timestamptz not null,
 quote_recorded_at timestamptz not null,
 quote_source_url text not null check(quote_source_url like 'https://%')
);
create index nba_editorial_picks_recent on public.nba_editorial_picks(published_at desc);
alter table public.nba_editorial_picks enable row level security;
revoke all on public.nba_editorial_picks from public, anon, authenticated, service_role;
grant select on public.nba_editorial_picks to anon, authenticated, service_role;
grant insert on public.nba_editorial_picks to service_role;
create policy member_read on public.nba_editorial_picks for select to anon, authenticated
 using ((select private.has_membership()));
create policy age_verified_account on public.nba_editorial_picks as restrictive for all to authenticated
 using ((select private.age_member_allowed()));

create function private.validate_nba_editorial_pick() returns trigger
language plpgsql security invoker set search_path='' as $$
declare g public.nba_games; o public.nba_observations; s jsonb;
begin
 select * into g from public.nba_games where id=new.game_id;
 if g.id is null or g.season_type is distinct from 2 or g.tipoff_tbd or g.tipoff<=now()
    or coalesce(g.status,'') ~ 'FINAL|IN_PROGRESS|HALFTIME|END_PERIOD|CANCEL|POSTPON|SUSPEND' then
  raise exception 'NBA_EDITORIAL_BLOCKED: upcoming regular-season game required';
 end if;
 select * into o from public.nba_observations where id=new.quote_observation_id;
 if o.id is null or o.game_id<>g.id or o.kind<>'prop'
    or o.payload->>'book' is distinct from new.book or o.payload->>'market' is distinct from new.market
    or o.observed_at is null or o.observed_at>now() or o.recorded_at>now()
    or o.observed_at<now()-interval '8 hours'
    or not exists(select 1 from jsonb_array_elements(o.payload->'outcomes') x
      where x->>'description'=new.player and x->>'name'=new.direction
       and (x->>'point')::numeric=new.line and (x->>'price')::integer=new.odds) then
  raise exception 'NBA_EDITORIAL_BLOCKED: exact recent NBA sportsbook observation required';
 end if;
 if coalesce(new.evidence->>'historical_cutoff','')='' or
    (new.evidence->>'historical_cutoff')::timestamptz>now() or
    coalesce(new.evidence->>'input_sha256','') !~ '^[a-f0-9]{64}$' or
    coalesce(new.evidence->>'availability_review','')='' or
    coalesce(new.evidence->>'role_review','')='' then
  raise exception 'NBA_EDITORIAL_BLOCKED: timestamped role and availability evidence required';
 end if;
 for s in select * from jsonb_array_elements(new.sources) loop
  if coalesce(s->>'url','') not like 'https://%' or coalesce(s->>'label','')='' then
   raise exception 'NBA_EDITORIAL_BLOCKED: source link required';
  end if;
 end loop;
 if new.supersedes_id is not null and not exists(select 1 from public.nba_editorial_picks p
    where p.id=new.supersedes_id and p.game_id=new.game_id and p.player=new.player and p.market=new.market) then
  raise exception 'NBA_EDITORIAL_BLOCKED: update must reference same original player and market';
 end if;
 new.published_at:=now(); new.expires_at:=g.tipoff;
 new.quote_observed_at:=o.observed_at; new.quote_recorded_at:=o.recorded_at;
 new.quote_source_url:=o.source;
 return new;
end $$;
revoke all on function private.validate_nba_editorial_pick() from public, anon, authenticated;
create trigger validate_nba_editorial_pick before insert on public.nba_editorial_picks
 for each row execute function private.validate_nba_editorial_pick();
create trigger immutable_nba_editorial_pick before update or delete on public.nba_editorial_picks
 for each row execute function private.immutable();
