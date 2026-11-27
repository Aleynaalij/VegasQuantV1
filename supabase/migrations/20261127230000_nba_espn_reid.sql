-- NBA feed: survive ESPN re-issuing a game under a new event id (2026-11-27).
--
-- nba-sync failed on every run from 2026-11-27 04:47 UTC (intermittently from 2026-11-21) with
-- `duplicate key value violates unique constraint "nba_games_slug_key"`: ESPN listed an upcoming
-- game under a new event id whose slug (away-home-ET date) we already store under the old id. The
-- games upsert only resolves conflicts on provider_id, so the insert hit the slug key, the batch
-- raised, and the function stopped before odds and props.
--
-- The same slug is the same game (same teams, same Eastern date). Before the upsert, a stored row
-- with that slug and a different ESPN id is moved to the new id, unless the new id is already
-- stored. Its uuid does not change, so observations, results and research stay linked, and
-- nba-results reads the summary by the id ESPN uses now. Everything else is unchanged from
-- 20261018060000_nba_source_feed.sql.
create or replace function private.ingest_nba(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; g public.nba_games; inserted integer:=0;
begin
 if octet_length(p::text) > 3000000 then raise exception 'Feed batch too large'; end if;
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if coalesce(r->>'provider_id','') !~ '^\d+$' or r->>'away_team' is null or r->>'home_team' is null
     or r->>'tipoff' is null or r->>'slug' is null or coalesce(r->>'source','') not like 'https://%' then
   raise exception 'Incomplete NBA fixture'; end if;
  -- ESPN re-issued this game under a new id: move the stored row (same slug) to it.
  update public.nba_games set provider_id = r->>'provider_id', source = r->>'source', updated_at = now()
   where slug = r->>'slug' and provider_id <> r->>'provider_id'
     and not exists (select 1 from public.nba_games x where x.provider_id = r->>'provider_id');
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
