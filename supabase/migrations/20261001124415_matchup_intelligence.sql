alter table public.games add column season integer, add column week integer, add column away_abbreviation text, add column home_abbreviation text, add column surface text, add column roof text, add column division_game boolean, add column rest_differential text, add column travel text, add column provider_id text unique, add column schedule_source text, add column schedule_observed_at timestamptz;
update public.games set season=2026,week=4,away_abbreviation='PIT',home_abbreviation='CLE' where slug='steelers-browns-2026-10-01';
create index games_season_week_idx on public.games(season,week,kickoff);
alter table public.analysis_versions add column intelligence jsonb check(intelligence is null or jsonb_typeof(intelligence)='object');
create index analysis_latest_idx on public.analysis_versions(game_id,version desc);
create table public.injuries(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),analysis_version_id uuid not null references public.analysis_versions(id),player text not null,tier integer check(tier between 1 and 3),details jsonb not null,created_at timestamptz not null default now());
create table public.weather_snapshots(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),analysis_version_id uuid not null references public.analysis_versions(id),details jsonb not null,created_at timestamptz not null default now());
create table public.team_metrics(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),analysis_version_id uuid not null references public.analysis_versions(id),team text not null,details jsonb not null,created_at timestamptz not null default now());
create table public.market_intelligence(id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),analysis_version_id uuid not null references public.analysis_versions(id),details jsonb not null,created_at timestamptz not null default now());
create table public.target_legs(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.games(id),analysis_version_id uuid not null references public.analysis_versions(id),
 market_type text not null,player_name text,selection text not null,
 current_number text,current_odds numeric check(abs(current_odds)>=100),target_number text,playable_number text,pass_number text,
 model_probability numeric check(model_probability between 0 and 100),market_probability numeric check(market_probability between 0 and 100),
 edge numeric,estimated_ev text,confidence numeric check(confidence between 0 and 10),risk numeric check(risk between 0 and 10),predicted_close text,
 status text not null check(status in ('WATCH','INTEREST','BETTABLE','WAIT','PRICE LOST','INJURY DEPENDENT','WEATHER DEPENDENT','PASS','OFFICIAL')),
 why_we_like_it text,what_we_are_waiting_for text,why_it_could_lose text,
 rank integer check(rank>0),official_pick_id uuid references public.official_picks(id),promoted_to_official boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((status='OFFICIAL' and official_pick_id is not null and promoted_to_official) or (status<>'OFFICIAL' and official_pick_id is null and not promoted_to_official))
);
do $$ declare t text; begin
 foreach t in array array['injuries','weather_snapshots','team_metrics','market_intelligence','target_legs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to anon,authenticated',t);
 execute format('create policy member_read on public.%I for select to anon,authenticated using ((select private.has_membership()))',t);
 execute format('create index on public.%I(game_id,analysis_version_id)',t);
 execute format('create trigger prevent_rewrite before update or delete on public.%I for each row execute function private.immutable()',t);
 end loop;
end $$;
create index target_official_idx on public.target_legs(official_pick_id);
create function private.publish_matchup(p_game uuid,p_update jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare prev public.analysis_versions; av public.analysis_versions; snap jsonb; t jsonb; receipt jsonb; begin
 if not private.is_admin() then raise exception 'Verified admin required'; end if;
 if octet_length(p_update::text)>150000 then raise exception 'Update exceeds 150 KB'; end if;
 perform pg_advisory_xact_lock(hashtext(p_request::text));
 select response into receipt from private.publish_receipts where request_id=p_request;
 if found then return receipt; end if;
 perform 1 from public.games where id=p_game for update;
 if not found then raise exception 'Game not found'; end if;
 select * into prev from public.analysis_versions where game_id=p_game order by version desc limit 1;
 if coalesce(trim(p_update->>'summary'),'')='' or coalesce(trim(p_update->>'raw_handoff'),'')='' then raise exception 'Summary and original handoff required'; end if;
 if prev.id is not null and (coalesce(trim(p_update->>'what_changed'),'')='' or coalesce(trim(p_update->>'response'),'')='') then raise exception 'What changed and analyst response required'; end if;
 if coalesce(p_update->>'status','') not in ('NOT ANALYZED','INITIAL ANALYSIS','MONITORING','TARGET IDENTIFIED','WAITING FOR PRICE','WAITING FOR INJURY NEWS','WAITING FOR WEATHER','MARKET MOVED','PASS','OFFICIAL PLAY') then raise exception 'Invalid status'; end if;
 if coalesce(p_update->>'update_type','') not in ('INITIAL ANALYSIS','MORNING UPDATE','EVENING UPDATE','INJURY UPDATE','WEATHER UPDATE','MARKET UPDATE','GAME DAY UPDATE','FINAL PRE-KICK UPDATE','OFFICIAL PICK UPDATE') then raise exception 'Invalid update type'; end if;
 if p_update->>'status'='OFFICIAL PLAY' and not exists(select 1 from public.official_picks where game_id=p_game) then raise exception 'Publish an official package through the official-pick workflow first'; end if;
 -- Omitted sections carry forward exactly. Explicit empty arrays clear the current view.
 -- The original supplied delta remains in raw_handoff; old versions are never rewritten.
 snap=(coalesce(prev.intelligence,'{}') || (p_update-'raw_handoff'));
 snap=snap-'next_review';
 if p_update ? 'next_review' then snap=snap||jsonb_build_object('next_review',p_update->'next_review'); end if;
 insert into public.analysis_versions(game_id,version,title,sections,projections,raw_handoff,source,intelligence)
 values(p_game,coalesce(prev.version,0)+1,p_update->>'summary',coalesce(p_update->'sections',prev.sections,'{}'),coalesce(p_update->'model',prev.projections,'{}'),p_update->>'raw_handoff',coalesce(p_update->>'source','Vegas Quant Ultra / owner handoff'),snap) returning * into av;
 for t in select value from jsonb_array_elements(coalesce(snap->'injuries','[]')) loop
 insert into public.injuries(game_id,analysis_version_id,player,tier,details) values(p_game,av.id,t->>'player',(t->>'tier')::integer,t); end loop;
 if snap ? 'weather' then insert into public.weather_snapshots(game_id,analysis_version_id,details) values(p_game,av.id,snap->'weather'); end if;
 for t in select value from jsonb_array_elements(coalesce(snap->'teams','[]')) loop
 insert into public.team_metrics(game_id,analysis_version_id,team,details) values(p_game,av.id,t->>'team',t); end loop;
 if snap ? 'vegas' then insert into public.market_intelligence(game_id,analysis_version_id,details) values(p_game,av.id,snap->'vegas'); end if;
 for t in select value from jsonb_array_elements(coalesce(snap->'targets','[]')) loop
 if t->>'status'='OFFICIAL' and not exists(select 1 from public.official_picks where id=(t->>'official_pick_id')::uuid and game_id=p_game and selection=t->>'selection') then raise exception 'Target requires a matching published official pick'; end if;
 insert into public.target_legs(game_id,analysis_version_id,market_type,player_name,selection,current_number,current_odds,target_number,playable_number,pass_number,model_probability,market_probability,edge,estimated_ev,confidence,risk,predicted_close,status,why_we_like_it,what_we_are_waiting_for,why_it_could_lose,rank,official_pick_id,promoted_to_official)
 values(p_game,av.id,t->>'market_type',t->>'player_name',t->>'selection',t->>'current_number',(t->>'current_odds')::numeric,t->>'target_number',t->>'playable_number',t->>'pass_number',(t->>'model_probability')::numeric,(t->>'market_probability')::numeric,(t->>'edge')::numeric,t->>'estimated_ev',(t->>'confidence')::numeric,(t->>'risk')::numeric,t->>'predicted_close',t->>'status',t->>'why_we_like_it',t->>'what_we_are_waiting_for',t->>'why_it_could_lose',(t->>'rank')::integer,(t->>'official_pick_id')::uuid,t->>'status'='OFFICIAL');
 end loop;
 receipt=jsonb_build_object('id',av.id,'version',av.version);
 insert into private.publish_receipts(request_id,action,response) values(p_request,'matchup_update',receipt);
 return receipt;
end $$;
create function public.publish_matchup(p_game uuid,p_update jsonb,p_request uuid) returns jsonb language sql security invoker set search_path='' as $$select private.publish_matchup(p_game,p_update,p_request);$$;
revoke all on function private.publish_matchup(uuid,jsonb,uuid),public.publish_matchup(uuid,jsonb,uuid) from public,anon;
grant execute on function private.publish_matchup(uuid,jsonb,uuid),public.publish_matchup(uuid,jsonb,uuid) to authenticated;
-- Invoker retains RLS: visitors see schedule only; research stays member-only.
create function public.matchup_directory() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('game',to_jsonb(g),'analysis',a.doc,'market',m.doc) order by g.kickoff),'[]')
 from public.games g
 left join lateral(select to_jsonb(v)-'raw_handoff'-'sections' as doc from public.analysis_versions v where v.game_id=g.id order by version desc limit 1) a on true
 left join lateral(select to_jsonb(v) as doc from public.market_snapshots v where v.game_id=g.id order by observed_at desc limit 1) m on true;
$$;
revoke all on function public.matchup_directory() from public;
grant execute on function public.matchup_directory() to anon,authenticated;
