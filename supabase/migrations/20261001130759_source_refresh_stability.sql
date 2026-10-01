-- Avoid unchanged schedule writes and audit noise during repeated polling.
create or replace function private.ingest_source(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; g public.games; inserted integer=0; begin
 if octet_length(p::text)>2000000 then raise exception 'Feed batch too large'; end if;
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if r->>'away_team' is null or r->>'home_team' is null or r->>'provider_id' is null or r->>'kickoff' is null then raise exception 'Incomplete fixture'; end if;
  select * into g from public.games where provider_id=r->>'provider_id' or (away_team=r->>'away_team' and home_team=r->>'home_team' and abs(extract(epoch from kickoff-(r->>'kickoff')::timestamptz))<86400) order by created_at limit 1 for update;
  if not found then
   insert into public.games(slug,away_team,home_team,kickoff,venue,slot,season,week,away_abbreviation,home_abbreviation,roof,provider_id,schedule_source,schedule_observed_at,kickoff_tbd)
   values(r->>'slug',r->>'away_team',r->>'home_team',(r->>'kickoff')::timestamptz,coalesce(r->>'venue','TBA'),r->>'slot',(r->>'season')::integer,(r->>'week')::integer,r->>'away_abbreviation',r->>'home_abbreviation',r->>'roof',r->>'provider_id',r->>'source',now(),coalesce((r->>'kickoff_tbd')::boolean,false)) returning * into g;
  else
   update public.games set provider_id=coalesce(provider_id,r->>'provider_id'),season=coalesce(season,(r->>'season')::integer),week=coalesce(week,(r->>'week')::integer),away_abbreviation=coalesce(away_abbreviation,r->>'away_abbreviation'),home_abbreviation=coalesce(home_abbreviation,r->>'home_abbreviation'),roof=coalesce(roof,r->>'roof'),schedule_source=r->>'source',schedule_observed_at=now() where id=g.id and (provider_id is distinct from coalesce(provider_id,r->>'provider_id') or season is distinct from coalesce(season,(r->>'season')::integer) or week is distinct from coalesce(week,(r->>'week')::integer) or away_abbreviation is distinct from coalesce(away_abbreviation,r->>'away_abbreviation') or home_abbreviation is distinct from coalesce(home_abbreviation,r->>'home_abbreviation') or roof is distinct from coalesce(roof,r->>'roof') or schedule_source is distinct from r->>'source');
   -- Keep published game context locked; conflicts remain visible in source observations.
   if not exists(select 1 from public.official_picks where game_id=g.id) and g.kickoff>now() then
    update public.games set kickoff=(r->>'kickoff')::timestamptz,slot=r->>'slot',venue=coalesce(r->>'venue',venue),kickoff_tbd=coalesce((r->>'kickoff_tbd')::boolean,false) where id=g.id and (kickoff is distinct from (r->>'kickoff')::timestamptz or slot is distinct from r->>'slot' or venue is distinct from coalesce(r->>'venue',venue) or kickoff_tbd is distinct from coalesce((r->>'kickoff_tbd')::boolean,false));
   end if;
  end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(p->'observations','[]')) loop
  select * into g from public.games where provider_id=r->>'provider_id' or id::text=r->>'game_id' limit 1;
  if not found then continue; end if;
  insert into public.source_observations(game_id,provider,kind,source,observed_at,fingerprint,payload)
  values(g.id,p->>'provider',r->>'kind',r->>'source',(r->>'observed_at')::timestamptz,r->>'fingerprint',r->'payload') on conflict(fingerprint) do nothing;
  if found then inserted=inserted+1; end if;
 end loop;
 insert into public.feed_runs(provider,status,details) values(p->>'provider',coalesce(p->>'status','ok'),coalesce(p->'details','{}')||jsonb_build_object('inserted',inserted));
 return jsonb_build_object('inserted',inserted);
end $$;

create or replace function public.matchup_directory() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('game',to_jsonb(g),'analysis',a.doc,'market',m.doc,'official',exists(select 1 from public.official_picks p where p.game_id=g.id)) order by g.kickoff),'[]')
 from public.games g
 left join lateral(select to_jsonb(v)-'raw_handoff'-'sections' as doc from public.analysis_versions v where v.game_id=g.id order by version desc limit 1) a on true
 left join lateral(select to_jsonb(v) as doc from public.market_snapshots v where v.game_id=g.id order by observed_at desc limit 1) m on true;
$$;
