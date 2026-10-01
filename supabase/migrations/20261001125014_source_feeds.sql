-- Machine-supplied facts remain separate from analyst versions and official records.
alter table public.games add column kickoff_tbd boolean not null default false;
create table public.source_observations(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),provider text not null,
 kind text not null check(kind in ('schedule','score','news','odds','injury','weather')),
 source text not null,observed_at timestamptz,recorded_at timestamptz not null default now(),
 fingerprint text not null unique,payload jsonb not null check(jsonb_typeof(payload)='object')
);
create index source_observations_game_idx on public.source_observations(game_id,kind,recorded_at desc);
alter table public.source_observations enable row level security;
grant select on public.source_observations to anon,authenticated;
create policy member_read on public.source_observations for select to anon,authenticated using((select private.has_membership()));
create trigger immutable_observation before update or delete on public.source_observations for each row execute function private.immutable();
create table public.feed_runs(id uuid primary key default gen_random_uuid(),provider text not null,status text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.feed_runs enable row level security;
grant select on public.feed_runs to authenticated;
create policy admin_read on public.feed_runs for select to authenticated using((select private.is_admin()));
create index feed_runs_latest_idx on public.feed_runs(created_at desc);
create table private.feed_credentials(digest text primary key,created_at timestamptz not null default now());
alter table private.feed_credentials enable row level security;
create function private.feed_authorize(p_digest text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from private.feed_credentials where digest=p_digest);$$;
create function public.feed_authorize(p_digest text) returns boolean language sql stable security invoker set search_path='' as $$select private.feed_authorize(p_digest);$$;
revoke all on function private.feed_authorize(text),public.feed_authorize(text) from public,anon,authenticated;
grant execute on function private.feed_authorize(text),public.feed_authorize(text) to service_role;
create function private.ingest_source(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; g public.games; inserted integer=0; begin
 if octet_length(p::text)>2000000 then raise exception 'Feed batch too large'; end if;
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if r->>'away_team' is null or r->>'home_team' is null or r->>'provider_id' is null or r->>'kickoff' is null then raise exception 'Incomplete fixture'; end if;
  select * into g from public.games where provider_id=r->>'provider_id' or (away_team=r->>'away_team' and home_team=r->>'home_team' and abs(extract(epoch from kickoff-(r->>'kickoff')::timestamptz))<86400) order by created_at limit 1 for update;
  if not found then
   insert into public.games(slug,away_team,home_team,kickoff,venue,slot,season,week,away_abbreviation,home_abbreviation,roof,provider_id,schedule_source,schedule_observed_at,kickoff_tbd)
   values(r->>'slug',r->>'away_team',r->>'home_team',(r->>'kickoff')::timestamptz,coalesce(r->>'venue','TBA'),r->>'slot',(r->>'season')::integer,(r->>'week')::integer,r->>'away_abbreviation',r->>'home_abbreviation',r->>'roof',r->>'provider_id',r->>'source',now(),coalesce((r->>'kickoff_tbd')::boolean,false)) returning * into g;
  else
   update public.games set provider_id=coalesce(provider_id,r->>'provider_id'),season=coalesce(season,(r->>'season')::integer),week=coalesce(week,(r->>'week')::integer),away_abbreviation=coalesce(away_abbreviation,r->>'away_abbreviation'),home_abbreviation=coalesce(home_abbreviation,r->>'home_abbreviation'),roof=coalesce(roof,r->>'roof'),schedule_source=r->>'source',schedule_observed_at=now() where id=g.id;
   -- Keep published game context locked; conflicts remain visible in source observations.
   if not exists(select 1 from public.official_picks where game_id=g.id) and g.kickoff>now() then
    update public.games set kickoff=(r->>'kickoff')::timestamptz,slot=r->>'slot',venue=coalesce(r->>'venue',venue),kickoff_tbd=coalesce((r->>'kickoff_tbd')::boolean,false) where id=g.id;
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
create function public.ingest_source(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ingest_source(p);$$;
revoke all on function private.ingest_source(jsonb),public.ingest_source(jsonb) from public,anon,authenticated;
grant execute on function private.ingest_source(jsonb),public.ingest_source(jsonb) to service_role;
