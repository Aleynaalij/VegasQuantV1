-- NBA source feed (step 1 of the NBA build). NBA games and provider facts live in their own tables
-- so nothing NFL-only (pages, selection gate, research board, shadow model, results sync) can see
-- them by accident. Filled by the nba-sync edge function every 15 minutes:
--   ESPN: schedule, status, scores and injuries;
--   The Odds API: game lines (moneyline, spread, total) and player props, from the same six books.
-- Paid price calls are switched in private.nba_feed_settings (lines on, props off by default) so
-- credit use can change without a redeploy. Nothing here creates picks, projections or results.
create table public.nba_games(
 id uuid primary key default gen_random_uuid(),
 provider_id text not null unique check(provider_id ~ '^\d+$'),
 slug text not null unique,
 away_team text not null, home_team text not null,
 away_abbreviation text, home_abbreviation text,
 tipoff timestamptz not null, tipoff_tbd boolean not null default false,
 venue text, season integer, season_type integer,
 status text, away_score integer, home_score integer,
 source text not null check(source like 'https://%'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index nba_games_tipoff_idx on public.nba_games(tipoff);
alter table public.nba_games enable row level security;
grant select on public.nba_games to anon, authenticated;
create policy public_read on public.nba_games for select to anon, authenticated using (true);
create policy age_verified_account on public.nba_games as restrictive for all to authenticated using ((select private.age_member_allowed()));

create table public.nba_observations(
 id uuid primary key default gen_random_uuid(),
 game_id uuid not null references public.nba_games(id),
 provider text not null,
 kind text not null check(kind in ('schedule','score','injury','odds','prop')),
 source text not null check(source like 'https://%'),
 observed_at timestamptz, recorded_at timestamptz not null default now(),
 fingerprint text not null unique,
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create index nba_observations_game_idx on public.nba_observations(game_id, kind, recorded_at desc);
alter table public.nba_observations enable row level security;
grant select on public.nba_observations to anon, authenticated;
create policy member_read on public.nba_observations for select to anon, authenticated using ((select private.has_membership()));
create policy age_verified_account on public.nba_observations as restrictive for all to authenticated using ((select private.age_member_allowed()));
create trigger immutable_nba_observation before update or delete on public.nba_observations for each row execute function private.immutable();

create table private.nba_feed_settings(
 singleton boolean primary key default true check(singleton),
 lines_enabled boolean not null default true,
 props_enabled boolean not null default false,
 prop_markets text[] not null default array['player_points','player_rebounds','player_assists','player_threes'],
 max_prop_events integer not null default 15 check(max_prop_events between 1 and 30),
 updated_at timestamptz not null default now()
);
insert into private.nba_feed_settings default values;
alter table private.nba_feed_settings enable row level security;
revoke all on private.nba_feed_settings from public, anon, authenticated, service_role;

create function public.nba_feed_settings() returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(s) - 'singleton' from private.nba_feed_settings s
$$;

create function private.ingest_nba(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; g public.nba_games; inserted integer:=0;
begin
 if octet_length(p::text) > 3000000 then raise exception 'Feed batch too large'; end if;
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if coalesce(r->>'provider_id','') !~ '^\d+$' or r->>'away_team' is null or r->>'home_team' is null
     or r->>'tipoff' is null or r->>'slug' is null or coalesce(r->>'source','') not like 'https://%' then
   raise exception 'Incomplete NBA fixture'; end if;
  insert into public.nba_games(provider_id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season,season_type,status,away_score,home_score,source)
  values(r->>'provider_id', r->>'slug', r->>'away_team', r->>'home_team', r->>'away_abbreviation', r->>'home_abbreviation',
   (r->>'tipoff')::timestamptz, coalesce((r->>'tipoff_tbd')::boolean,false), r->>'venue', (r->>'season')::integer,
   (r->>'season_type')::integer, r->>'status', (r->>'away_score')::integer, (r->>'home_score')::integer, r->>'source')
  on conflict(provider_id) do update set
   tipoff=excluded.tipoff, tipoff_tbd=excluded.tipoff_tbd, venue=coalesce(excluded.venue, public.nba_games.venue),
   season=coalesce(excluded.season, public.nba_games.season), season_type=coalesce(excluded.season_type, public.nba_games.season_type),
   status=excluded.status, away_score=coalesce(excluded.away_score, public.nba_games.away_score),
   home_score=coalesce(excluded.home_score, public.nba_games.home_score), updated_at=now()
  where (public.nba_games.tipoff, public.nba_games.tipoff_tbd, public.nba_games.venue, public.nba_games.status, public.nba_games.away_score, public.nba_games.home_score)
   is distinct from (excluded.tipoff, excluded.tipoff_tbd, coalesce(excluded.venue, public.nba_games.venue), excluded.status,
   coalesce(excluded.away_score, public.nba_games.away_score), coalesce(excluded.home_score, public.nba_games.home_score));
 end loop;
 for r in select value from jsonb_array_elements(coalesce(p->'observations','[]')) loop
  select * into g from public.nba_games where provider_id=r->>'provider_id';
  if not found then continue; end if;
  insert into public.nba_observations(game_id,provider,kind,source,observed_at,fingerprint,payload)
  values(g.id, p->>'provider', r->>'kind', r->>'source', (r->>'observed_at')::timestamptz, r->>'fingerprint', r->'payload')
  on conflict(fingerprint) do nothing;
  if found then inserted:=inserted+1; end if;
 end loop;
 insert into public.feed_runs(provider,status,details)
 values(p->>'provider', coalesce(p->>'status','ok'), coalesce(p->'details','{}') || jsonb_build_object('inserted',inserted));
 return jsonb_build_object('inserted',inserted);
end $$;
create function public.ingest_nba(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.ingest_nba(p) $$;
revoke all on function private.ingest_nba(jsonb), public.ingest_nba(jsonb), public.nba_feed_settings() from public, anon, authenticated;
grant execute on function private.ingest_nba(jsonb), public.ingest_nba(jsonb), public.nba_feed_settings() to service_role;

do $$
begin
 if exists (select 1 from cron.job where jobname='nba-source-refresh') then perform cron.unschedule('nba-source-refresh'); end if;
 perform cron.schedule('nba-source-refresh', '2,17,32,47 * * * *', $job$
 select net.http_post(
  url:='https://uowearboulykfcwnuirn.supabase.co/functions/v1/nba-sync',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='vq_source_sync_token')),
  body:='{}'::jsonb, timeout_milliseconds:=120000
 );
 $job$);
end $$;
