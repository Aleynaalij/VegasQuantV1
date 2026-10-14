create table private.result_sync_settings(singleton boolean primary key default true check(singleton),activated_at timestamptz not null default now());
alter table private.result_sync_settings enable row level security;
insert into private.result_sync_settings(singleton)values(true);
grant select on private.result_sync_settings to service_role;
-- Editorial stat results only. No sportsbook settlement, official challenge or bankroll mutations.
create table private.leg_result_contracts(
 leg_key text primary key,game_id uuid not null references public.games(id),player text not null,team text not null,
 metric text not null check(metric in ('rushing_yards','receiving_yards','passing_yards','receptions')),
 threshold numeric not null check(threshold>=0),operator text not null check(operator in ('gte','over','under')),
 period text not null check(period='full_game'),market text not null,created_at timestamptz not null default now()
);
alter table private.leg_result_contracts enable row level security;
create trigger immutable_contract before update or delete on private.leg_result_contracts for each row execute function private.immutable();
create table public.leg_result_progress(
 leg_key text primary key references private.leg_result_contracts(leg_key),status text not null check(status in ('TRACKING','TARGET_REACHED_LIVE','AWAITING_CORROBORATION','FINAL','CONFLICT','BLOCKED')),
 value numeric,reason text not null,source_url text not null check(source_url ~ '^https://'),checked_at timestamptz not null default now()
);
alter table public.leg_result_progress enable row level security;
grant select on public.leg_result_progress to authenticated;
create policy progress_read on public.leg_result_progress for select to authenticated using((select private.has_membership()) and (select private.age_member_allowed()));
create table private.leg_result_evidence(
 leg_key text primary key references private.leg_result_contracts(leg_key),value numeric not null,
 espn jsonb not null,nflverse jsonb not null,verified_at timestamptz not null default now()
);
alter table private.leg_result_evidence enable row level security;
create trigger immutable_result_evidence before update or delete on private.leg_result_evidence for each row execute function private.immutable();
alter table public.research_feed_posts add column result_leg_key text unique;
alter table public.research_feed_posts add column result_details jsonb;
grant usage on schema private to service_role;
grant select,insert on private.leg_result_contracts,private.leg_result_evidence to service_role;
grant select,insert,update on public.leg_result_progress to service_role;
grant select,insert on public.research_leg_results,public.research_feed_posts to service_role;
create function public.finalize_editorial_leg(p_key text,p_espn jsonb,p_nflverse jsonb)returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c private.leg_result_contracts;g public.games;v numeric;outcome text;post uuid;begin
 perform pg_advisory_xact_lock(hashtextextended(p_key,0));
 select * into strict c from private.leg_result_contracts where leg_key=p_key;
 select * into strict g from public.games where id=c.game_id;
 if not exists(select 1 from public.published_legs l where l.leg_key=p_key and l.name=c.player and l.market=c.market and l.kind<>'OFFICIAL') then raise exception 'Published selection mismatch';end if;
 if g.kickoff>now() or (p_espn->>'event_id') is distinct from g.provider_id or (p_espn->>'completed') is distinct from 'true' or
 (p_espn->>'source_url') is distinct from ('https://www.espn.com/nfl/boxscore/_/gameId/'||g.provider_id) or
 (p_nflverse->>'source_url') is distinct from ('https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_'||g.season::text||'.csv') or
 coalesce(p_espn->>'hash','')!~'^[a-f0-9]{64}$' or coalesce(p_nflverse->>'hash','')!~'^[a-f0-9]{64}$' or
 coalesce(p_espn->>'value','')!~'^-?[0-9]+(\.[0-9]+)?$' or coalesce(p_nflverse->>'value','')!~'^-?[0-9]+(\.[0-9]+)?$' or
 (p_espn->>'value')::numeric<>(p_nflverse->>'value')::numeric then raise exception 'Missing, mismatched or uncorroborated final evidence';end if;
 if coalesce(p_espn->>'retrieved_at','')='' or coalesce(p_nflverse->>'retrieved_at','')='' or
 (p_espn->>'retrieved_at')::timestamptz>now() or (p_nflverse->>'retrieved_at')::timestamptz>now() then raise exception 'Invalid evidence timestamp';end if;
 if exists(select 1 from public.research_leg_results where leg_key=p_key) then return jsonb_build_object('inserted',false,'conflict',exists(select 1 from private.leg_result_evidence e where e.leg_key=p_key and e.value<>(p_espn->>'value')::numeric));end if;
 v:=(p_espn->>'value')::numeric;
 outcome:=case when c.operator='gte' then case when v>=c.threshold then 'WIN' else 'LOSS' end
 when v=c.threshold then 'PUSH' when (c.operator='over' and v>c.threshold) or(c.operator='under' and v<c.threshold)then 'WIN' else 'LOSS' end;
 insert into private.leg_result_evidence(leg_key,value,espn,nflverse)values(p_key,v,p_espn,p_nflverse);
 insert into public.research_leg_results(leg_key,result,source_url)values(p_key,outcome,p_espn->>'source_url');
 if exists(select 1 from public.published_legs l cross join private.result_sync_settings s where l.leg_key=p_key and l.published_at>=s.activated_at)then
 insert into public.research_feed_posts(game_id,category,title,summary,matchup,away_code,home_code,market_label,why_watch,caution,next_check,source_url,source_at,result_leg_key,result_details)
 values(g.id,'Decision',left(c.player||' · '||outcome||' · '||c.market,160),left('Final total: '||v::text||'. Original selection: '||c.market||'. ESPN final box score corroborated by nflverse weekly player stats.',600),left(g.away_team||' @ '||g.home_team,160),g.away_abbreviation,g.home_abbreviation,c.market,
 'Automatic result for the exact published full-game selection. Includes overtime. Original publication and quote remain unchanged.',
 'Editorial stat result, not confirmation of a placed wager or sportsbook payout. Provider corrections can occur; discrepancies are flagged for review.',
 'Your tailed Records update from this sourced outcome. No stake, payout or profit assumed.',p_espn->>'source_url',(p_espn->>'retrieved_at')::timestamptz,p_key,
 jsonb_build_object('player',c.player,'market',c.market,'result',outcome,'value',v,'metric',c.metric,'espn_url',p_espn->>'source_url','nflverse_url',p_nflverse->>'source_url','verified_at',now()))returning id into post;
 end if;
 return jsonb_build_object('inserted',true,'result',outcome,'post_id',post);
end $$;
revoke all on function public.finalize_editorial_leg(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.finalize_editorial_leg(text,jsonb,jsonb) to service_role;

create function public.register_result_contracts(p jsonb)returns integer language plpgsql security invoker set search_path='' as $$
declare r jsonb;n integer=0;begin
 if jsonb_array_length(p)>1000 then raise exception 'Batch too large';end if;
 for r in select value from jsonb_array_elements(p) loop
 if not exists(select 1 from public.published_legs l where l.leg_key=r->>'leg_key' and l.name=r->>'player' and l.market=r->>'market' and l.kind<>'OFFICIAL')then raise exception 'Invalid publication';end if;
 insert into private.leg_result_contracts(leg_key,game_id,player,team,metric,threshold,operator,period,market)
 values(r->>'leg_key',(r->>'game_id')::uuid,r->>'player',r->>'team',r->>'metric',(r->>'threshold')::numeric,r->>'operator',r->>'period',r->>'market')on conflict(leg_key)do nothing;
 if found then n:=n+1;end if;
 end loop;return n;end $$;
revoke all on function public.register_result_contracts(jsonb) from public,anon,authenticated;
grant execute on function public.register_result_contracts(jsonb) to service_role;

grant select on public.published_legs,public.games,public.candidate_releases to service_role;
grant insert on public.feed_runs to service_role;
