-- NBA feed: NBA Cup knockout placeholders ("TBD" vs "TBD") no longer break the schedule import
-- (2026-11-27).
--
-- nba-sync failed on every run from 2026-11-27 04:47 UTC (intermittently from 2026-11-21) with
-- `duplicate key value violates unique constraint "nba_games_slug_key"`. ESPN lists the knockout
-- games before the teams are known, all as TBD vs TBD, so every one on a date gets the same slug
-- (e.g. tbd-tbd-20261204). The first was stored; the next raised, the whole batch failed, and the
-- function stopped before odds and props.
--
--  * Placeholder fixtures (either side TBD) are skipped until ESPN names both teams.
--  * A stored game that is still a placeholder takes its real teams, abbreviations and slug when
--    the same ESPN id comes back with them (ESPN keeps the event id). Previously an existing row's
--    teams were never updated, so it would have stayed TBD vs TBD.
-- Everything else is unchanged from 20261018060000_nba_source_feed.sql.
create or replace function private.ingest_nba(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; g public.nba_games; inserted integer:=0;
begin
 if octet_length(p::text) > 3000000 then raise exception 'Feed batch too large'; end if;
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if coalesce(r->>'provider_id','') !~ '^\d+$' or r->>'away_team' is null or r->>'home_team' is null
     or r->>'tipoff' is null or r->>'slug' is null or coalesce(r->>'source','') not like 'https://%' then
   raise exception 'Incomplete NBA fixture'; end if;
  -- Knockout placeholder: no teams yet. Skipped until ESPN names both sides.
  if upper(r->>'away_team') = 'TBD' or upper(r->>'home_team') = 'TBD'
     or upper(coalesce(r->>'away_abbreviation','')) = 'TBD' or upper(coalesce(r->>'home_abbreviation','')) = 'TBD' then
   continue; end if;
  insert into public.nba_games(provider_id,slug,away_team,home_team,away_abbreviation,home_abbreviation,tipoff,tipoff_tbd,venue,season,season_type,status,away_score,home_score,source)
  values(r->>'provider_id', r->>'slug', r->>'away_team', r->>'home_team', r->>'away_abbreviation', r->>'home_abbreviation',
   (r->>'tipoff')::timestamptz, coalesce((r->>'tipoff_tbd')::boolean,false), r->>'venue', (r->>'season')::integer,
   (r->>'season_type')::integer, r->>'status', (r->>'away_score')::integer, (r->>'home_score')::integer, r->>'source')
  on conflict(provider_id) do update set
   -- A stored placeholder takes the teams once they are known; real teams never change.
   slug=case when public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD' then excluded.slug else public.nba_games.slug end,
   away_team=case when public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD' then excluded.away_team else public.nba_games.away_team end,
   home_team=case when public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD' then excluded.home_team else public.nba_games.home_team end,
   away_abbreviation=case when public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD' then excluded.away_abbreviation else public.nba_games.away_abbreviation end,
   home_abbreviation=case when public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD' then excluded.home_abbreviation else public.nba_games.home_abbreviation end,
   tipoff=excluded.tipoff, tipoff_tbd=excluded.tipoff_tbd, venue=coalesce(excluded.venue, public.nba_games.venue),
   season=coalesce(excluded.season, public.nba_games.season), season_type=coalesce(excluded.season_type, public.nba_games.season_type),
   status=excluded.status, away_score=coalesce(excluded.away_score, public.nba_games.away_score),
   home_score=coalesce(excluded.home_score, public.nba_games.home_score), updated_at=now()
  where public.nba_games.away_team='TBD' or public.nba_games.home_team='TBD'
   or (public.nba_games.tipoff, public.nba_games.tipoff_tbd, public.nba_games.venue, public.nba_games.status, public.nba_games.away_score, public.nba_games.home_score)
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
