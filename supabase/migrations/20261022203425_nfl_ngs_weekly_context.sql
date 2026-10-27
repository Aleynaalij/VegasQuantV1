-- Public weekly summaries via nflverse. No GSIS/live subscription or model change.
create table public.nfl_ngs_snapshots (
 id uuid primary key default gen_random_uuid(),
 stat_type text not null check(stat_type in ('passing','rushing','receiving')),
 seasons integer[] not null check(cardinality(seasons) between 1 and 2),
 source_url text not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 source_updated_at timestamptz not null,
 retrieved_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 row_count integer not null check(row_count between 1 and 20000),
 rows jsonb not null check(jsonb_typeof(rows)='array'),
 attribution text not null default 'NFL Next Gen Stats via nflverse · CC BY 4.0 · team abbreviations normalized',
 unique(stat_type,seasons,source_sha256),
 check(source_url='https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_'||stat_type||'.csv.gz'
    or source_url='https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_'||stat_type||'.csv'),
 check(source_updated_at<=retrieved_at)
);
create index nfl_ngs_latest on public.nfl_ngs_snapshots(stat_type,retrieved_at desc);
alter table public.nfl_ngs_snapshots enable row level security;
revoke all on public.nfl_ngs_snapshots from public,anon,authenticated;
grant select on public.nfl_ngs_snapshots to authenticated;
grant select,insert on public.nfl_ngs_snapshots to service_role;
create policy member_read on public.nfl_ngs_snapshots for select to authenticated using((select private.has_membership()) and (select private.age_member_allowed()));
create trigger immutable_ngs before update or delete on public.nfl_ngs_snapshots for each row execute function private.immutable();

create function public.ingest_nfl_ngs(p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare source_id uuid; r jsonb; season_values integer[]; n integer; begin
 if octet_length(p::text)>8000000 or jsonb_typeof(p->'rows') is distinct from 'array' then raise exception 'Invalid NGS batch';end if;
 select array_agg(x::integer order by x::integer) into season_values from jsonb_array_elements_text(p->'seasons') x;
 if cardinality(season_values) not between 1 and 2 or exists(select 1 from unnest(season_values) y where y<2016 or y>extract(year from now())::int) then raise exception 'Invalid NGS seasons';end if;
 n:=jsonb_array_length(p->'rows');
 if n is distinct from (p->>'row_count')::integer then raise exception 'NGS row count mismatch';end if;
 if (p->>'retrieved_at')::timestamptz>now()+interval '5 minutes' then raise exception 'NGS retrieval is in the future';end if;
 for r in select value from jsonb_array_elements(p->'rows') loop
  if not coalesce((r->>'season')::integer=any(season_values),false)
    or not coalesce((r->>'week')::integer between 0 and 23,false)
    or coalesce(r->>'season_type','') not in ('REG','POST')
    or coalesce(r->>'player_gsis_id','') !~ '^\d{2}-\d{7}$'
    or nullif(r->>'player_display_name','') is null
    or coalesce(r->>'team_abbr','') !~ '^[A-Z]{2,3}$' then raise exception 'Invalid NGS player-week';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p->'rows') x group by x->>'season',x->>'season_type',x->>'week',x->>'player_gsis_id',x->>'team_abbr' having count(*)>1) then raise exception 'Duplicate NGS player-week';end if;
 insert into public.nfl_ngs_snapshots(stat_type,seasons,source_url,source_sha256,source_updated_at,retrieved_at,row_count,rows)
 values(p->>'stat_type',season_values,p->>'source_url',p->>'source_sha256',(p->>'source_updated_at')::timestamptz,(p->>'retrieved_at')::timestamptz,n,p->'rows')
 on conflict(stat_type,seasons,source_sha256) do nothing returning id into source_id;
 if source_id is null then
  select id into source_id from public.nfl_ngs_snapshots where stat_type=p->>'stat_type' and seasons=season_values and source_sha256=p->>'source_sha256';
 end if;
 insert into public.feed_runs(provider,status,details) values('nflverse NGS','ok',jsonb_build_object('stat_type',p->>'stat_type','snapshot_id',source_id,'rows',n,'source_updated_at',p->>'source_updated_at'));
 return jsonb_build_object('snapshot_id',source_id,'stored_rows',n);
end$$;
revoke all on function public.ingest_nfl_ngs(jsonb) from public,anon,authenticated;
grant execute on function public.ingest_nfl_ngs(jsonb) to service_role;

create function public.nfl_ngs_game_context(p_game_id uuid,p_before timestamptz default null) returns jsonb language sql stable security invoker set search_path='' as $$
 with game as(select * from public.games where id=p_game_id and lower(sport)='nfl'),
 latest as(
  select distinct on(s.stat_type) s.* from public.nfl_ngs_snapshots s,game g
  where s.retrieved_at<=least(coalesce(p_before,now()),now()) and g.season=any(s.seasons)
  order by s.stat_type,s.retrieved_at desc,s.recorded_at desc
 ), datasets as(
  select s.id,s.stat_type,s.source_url,s.source_sha256,s.source_updated_at,s.retrieved_at,s.attribution,
  (select max((x->>'week')::integer) from jsonb_array_elements(s.rows) x,game g where (x->>'season')::integer=g.season and x->>'season_type'='REG' and (x->>'week')::integer between 1 and g.week-1) as through_week,
  coalesce((select jsonb_agg(r order by r->>'team_abbr',r->>'player_display_name') from (
   select distinct on(x->>'player_gsis_id',x->>'team_abbr') x as r from jsonb_array_elements(s.rows) x,game g
   where (x->>'season')::integer=g.season and x->>'season_type'='REG'
    and (x->>'week')::integer between greatest(1,g.week-3) and g.week-1
    and x->>'team_abbr' in (g.away_abbreviation,g.home_abbreviation)
   order by x->>'player_gsis_id',x->>'team_abbr',(x->>'week')::integer desc
  ) matched),'[]'::jsonb) as rows
  from latest s
 ) select jsonb_build_object('game_id',p_game_id,'datasets',coalesce(jsonb_agg(to_jsonb(datasets)),'[]'::jsonb)) from datasets;
$$;
revoke all on function public.nfl_ngs_game_context(uuid,timestamptz) from public,anon;
grant execute on function public.nfl_ngs_game_context(uuid,timestamptz) to authenticated,service_role;
