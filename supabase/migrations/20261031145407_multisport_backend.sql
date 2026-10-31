-- NHL + men's D-I basketball data and exact-market contracts. No simulator/model approval.
create table public.sports_games(
 id uuid primary key default gen_random_uuid(), sport text not null check(sport in ('nhl','ncaab')),
 provider_id text not null check(provider_id ~ '^\d+$'), slug text not null,
 start_time timestamptz not null, payload jsonb not null, updated_at timestamptz not null default now(),
 unique(sport,provider_id),unique(sport,slug),check(jsonb_typeof(payload)='object')
);
create index sports_games_slate on public.sports_games(sport,start_time);
create table private.sports_sources(
 id uuid primary key default gen_random_uuid(), url text not null check(url like 'https://%'),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), retrieved_at timestamptz not null,
 body text not null,unique(url,sha256)
);
create table public.sports_markets(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.sports_games,
 source_id uuid not null references private.sports_sources, fingerprint text not null unique,
 observed_at timestamptz not null,expires_at timestamptz not null,payload jsonb not null,
 check(expires_at>observed_at)
);
create index sports_markets_game on public.sports_markets(game_id,observed_at desc);
create table public.sports_facts(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.sports_games,
 source_id uuid not null references private.sports_sources,kind text not null check(kind in ('injury','roster','team_context','player_context')),
 fingerprint text not null unique,payload jsonb not null,source jsonb not null,recorded_at timestamptz not null default now()
);
create index sports_facts_game on public.sports_facts(game_id,recorded_at desc);
create table public.sports_result_progress(
 game_id uuid primary key references public.sports_games,
 status text not null check(status in ('AWAITING_FINAL','CONFIRMING','FINAL','CONFLICT','NO_RESULT')),
 reason text not null,checked_at timestamptz not null default now()
);
create table private.sports_result_staging(game_id uuid primary key references public.sports_games,fingerprint text not null,first_seen_at timestamptz not null);
create table public.sports_results(
 game_id uuid primary key references public.sports_games,source_id uuid not null references private.sports_sources,
 fingerprint text not null,payload jsonb not null,recorded_at timestamptz not null default now()
);
create table private.sports_result_corrections(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.sports_games,
 source_id uuid not null references private.sports_sources,payload jsonb not null,fingerprint text not null,
 detected_at timestamptz not null default now(),unique(game_id,fingerprint)
);
create table public.sports_selections(
 id uuid primary key default gen_random_uuid(),game_id uuid not null references public.sports_games,
 market_id uuid not null references public.sports_markets,title text not null,why text not null,risk text not null,
 author_id uuid not null references auth.users,published_at timestamptz not null default now(),expires_at timestamptz not null,
 sources jsonb not null,classification text not null default 'QUALITATIVE_EDITORIAL' check(classification='QUALITATIVE_EDITORIAL'),
 unique(market_id)
);
create table private.sports_feed_settings(
 sport text primary key check(sport in ('nhl','ncaab')),lines_enabled boolean not null default true,
 props_enabled boolean not null default false,max_prop_events integer not null default 8 check(max_prop_events between 1 and 20),
 last_lines_at timestamptz,last_schedule_at timestamptz,last_context_at timestamptz,
 prop_fetched jsonb not null default '{}',credits_remaining integer
);
insert into private.sports_feed_settings(sport,props_enabled) values('nhl',true),('ncaab',false);
-- Deny-by-default grants + RLS, including the service-only raw evidence stores.
do $$ declare t text; begin
 foreach t in array array['sports_games','sports_markets','sports_facts','sports_result_progress','sports_results','sports_selections'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t in ('sports_games','sports_result_progress') then
   execute format('create policy public_read on public.%I for select to anon,authenticated using(true)',t);
  else
   execute format('create policy member_read on public.%I for select to anon,authenticated using((select private.has_membership()))',t);
  end if;
  execute format('create policy age_verified_account on public.%I as restrictive for all to authenticated using((select private.age_member_allowed()))',t);
 end loop;
 foreach t in array array['sports_sources','sports_result_staging','sports_result_corrections','sports_feed_settings'] loop
  execute format('alter table private.%I enable row level security',t);
  execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['sports_markets','sports_facts','sports_results','sports_selections'] loop
  execute format('create trigger immutable_row before update or delete on public.%I for each row execute function private.immutable()',t);
 end loop;
 foreach t in array array['sports_sources','sports_result_corrections'] loop
  execute format('create trigger immutable_row before update or delete on private.%I for each row execute function private.immutable()',t);
 end loop;
end $$;
create function private.sports_source(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s uuid;begin
 if coalesce(p->>'url','') !~ '^https://' or coalesce(p->>'sha256','') !~ '^[a-f0-9]{64}$'
 or p->>'body' is null or octet_length(p->>'body')>10000000
 or encode(sha256(convert_to(p->>'body','UTF8')),'hex') is distinct from p->>'sha256'
 or (p->>'retrieved_at')::timestamptz>now()+interval '1 minute' then raise exception 'Invalid source evidence';end if;
 insert into private.sports_sources(url,sha256,retrieved_at,body) values(p->>'url',p->>'sha256',(p->>'retrieved_at')::timestamptz,p->>'body') on conflict(url,sha256) do nothing;
 select id into s from private.sports_sources where url=p->>'url' and sha256=p->>'sha256';return s;
end $$;
create function private.ingest_sports(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s uuid; r jsonb; g public.sports_games; fp text; n integer:=0; v_sport text:=p->>'sport';m text;
begin
 if v_sport not in ('nhl','ncaab') or v_sport is null or octet_length(p::text)>15000000 then raise exception 'Invalid sport batch';end if;
 s:=private.sports_source(p->'source');
 for r in select value from jsonb_array_elements(coalesce(p->'games','[]')) loop
  if r->>'sport' is distinct from v_sport or coalesce(r->>'provider_id','')!~'^\d+$' or r->>'start_time' is null
  or r->>'slug' is null or r->'away'->>'provider_id' is null or r->'home'->>'provider_id' is null
  or r->'away'->>'id'=r->'home'->>'id' then raise exception 'Invalid fixture';end if;
  insert into public.sports_games(sport,provider_id,slug,start_time,payload)
  values(v_sport,r->>'provider_id',r->>'slug',(r->>'start_time')::timestamptz,r-'id')
  on conflict(sport,provider_id) do update set start_time=excluded.start_time,payload=excluded.payload,updated_at=now();
 end loop;
 for r in select value from jsonb_array_elements(coalesce(p->'markets','[]')) loop
  select * into g from public.sports_games where id=(r->>'game_id')::uuid and sports_games.sport=v_sport;
  if not found then raise exception 'Unknown market game';end if;m:=r->>'market';
  if m is null or r->>'observed_at' is null or r->>'expires_at' is null or r->>'settlement' is null or r->'source' is distinct from ((p->'source')-'body') or r->>'sport' is distinct from v_sport or r->>'book' is distinct from 'FanDuel' or r->>'period' is distinct from 'full_game'
   or (v_sport='ncaab' and m not in ('h2h','spreads')) or (v_sport='nhl' and m not in ('h2h','totals','player_points','player_goals','player_goal_scorer_anytime'))
   or g.start_time<=now() or coalesce((g.payload->>'start_time_tbd')::boolean,true)
   or coalesce((r->>'odds')::numeric,0)<>trunc(coalesce((r->>'odds')::numeric,0)) or abs(coalesce((r->>'odds')::numeric,0))<100 or abs((r->>'odds')::numeric)>100000
   or (r->>'observed_at')::timestamptz>now() or (r->>'observed_at')::timestamptz<now()-interval '30 minutes'
   or (r->>'expires_at')::timestamptz>least(g.start_time,(r->>'observed_at')::timestamptz+interval '30 minutes')
   or (m in ('totals','player_points','player_goals') and (coalesce(r->>'direction','') not in ('Over','Under') or r->>'line' is null))
   or (m in ('h2h','spreads') and (coalesce(r->>'side','') not in ('home','away') or r->>'selection' is distinct from (g.payload->(r->>'side')->>'name')))
   or (m='spreads' and r->>'line' is null)
   or (m='player_goal_scorer_anytime' and r->>'direction' is distinct from 'Yes')
   or (m like 'player_%' and (r->>'player' is null or r->>'settlement' is distinct from 'skater_stats_excluding_shootout'))
   or (m not like 'player_%' and r->>'settlement' is distinct from case when v_sport='nhl' then 'including_overtime_shootout' else 'including_overtime' end)
  then raise exception 'Invalid or stale sport market';end if;
  fp:=encode(sha256(convert_to((r-'id'-'source')::text,'UTF8')),'hex');
  insert into public.sports_markets(game_id,source_id,fingerprint,observed_at,expires_at,payload)
  values(g.id,s,fp,(r->>'observed_at')::timestamptz,(r->>'expires_at')::timestamptz,r-'id') on conflict(fingerprint) do nothing;
  if found then n:=n+1;end if;
 end loop;
 for r in select value from jsonb_array_elements(coalesce(p->'facts','[]')) loop
  select * into g from public.sports_games where id=(r->>'game_id')::uuid and sports_games.sport=v_sport;
  if not found then raise exception 'Unknown fact game';end if;
  fp:=encode(sha256(convert_to(jsonb_build_array(g.id,r->>'kind',r->'payload',p->'source'->>'sha256')::text,'UTF8')),'hex');
  insert into public.sports_facts(game_id,source_id,kind,fingerprint,payload,source) values(g.id,s,r->>'kind',fp,r->'payload',(p->'source')-'body') on conflict(fingerprint) do nothing;
 end loop;
 insert into public.feed_runs(provider,status,details) values('sports-sync:'||v_sport,coalesce(p->>'status','ok'),coalesce(p->'details','{}')||jsonb_build_object('markets_inserted',n));
 return jsonb_build_object('markets_inserted',n);
end $$;
create function public.ingest_sports(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.ingest_sports(p)$$;
create function public.sports_feed_settings(p_sport text) returns jsonb language sql security definer set search_path='' as $$select to_jsonb(s) from private.sports_feed_settings s where sport=p_sport$$;
create function public.sports_feed_checkpoint(p_sport text,p jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 update private.sports_feed_settings set last_lines_at=coalesce((p->>'last_lines_at')::timestamptz,last_lines_at),last_schedule_at=coalesce((p->>'last_schedule_at')::timestamptz,last_schedule_at),last_context_at=coalesce((p->>'last_context_at')::timestamptz,last_context_at),prop_fetched=coalesce(p->'prop_fetched',prop_fetched),credits_remaining=coalesce((p->>'credits_remaining')::integer,credits_remaining) where sport=p_sport;
end $$;
-- Public wrapper uses invoker RLS. Private evidence never goes to clients.
create function public.sports_slate(p_sport text,p_days integer default 7) returns jsonb language sql stable security invoker set search_path='' as $$
 with slate as(select * from public.sports_games where sport=p_sport and start_time>=date_trunc('day',now() at time zone 'America/New_York') at time zone 'America/New_York' and start_time<now()+make_interval(days=>greatest(1,least(p_days,14))))
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at) order by start_time,id) from slate),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join slate g on g.id=m.game_id where m.expires_at>now() and not exists(select 1 from public.sports_markets newer where newer.game_id=m.game_id and newer.payload->>'market'=m.payload->>'market' and newer.observed_at>m.observed_at) and g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)),'[]'),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'game_id',f.game_id,'kind',f.kind,'payload',f.payload,'source',f.source)) from public.sports_facts f join slate g on g.id=f.game_id where not exists(select 1 from public.sports_facts newer where newer.game_id=f.game_id and newer.kind=f.kind and newer.payload->>'team_id' is not distinct from f.payload->>'team_id' and newer.recorded_at>f.recorded_at)),'[]'),
 'selections',coalesce((select jsonb_agg(to_jsonb(s)-'author_id') from public.sports_selections s join slate g on g.id=s.game_id),'[]'),
 'results',coalesce((select jsonb_agg(to_jsonb(r)) from public.sports_result_progress r join slate g on g.id=r.game_id),'[]'))
$$;
create function public.sports_game(p_sport text,p_slug text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('version',1,'sport',p_sport,'generated_at',now(),'access',coalesce(private.has_membership(),false) and (auth.uid() is null or private.age_member_allowed()),
 'games',coalesce((select jsonb_agg(payload||jsonb_build_object('id',id,'updated_at',updated_at)) from public.sports_games where sport=p_sport and slug=p_slug),'[]'),
 'markets',coalesce((select jsonb_agg(m.payload||jsonb_build_object('id',m.id)) from public.sports_markets m join public.sports_games g on g.id=m.game_id where g.sport=p_sport and g.slug=p_slug and m.expires_at>now() and not exists(select 1 from public.sports_markets newer where newer.game_id=m.game_id and newer.payload->>'market'=m.payload->>'market' and newer.observed_at>m.observed_at) and g.start_time>now() and not coalesce((g.payload->>'completed')::boolean,false)),'[]'),
 'facts',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'game_id',f.game_id,'kind',f.kind,'payload',f.payload,'source',f.source)) from public.sports_facts f join public.sports_games g on g.id=f.game_id where g.sport=p_sport and g.slug=p_slug and not exists(select 1 from public.sports_facts newer where newer.game_id=f.game_id and newer.kind=f.kind and newer.payload->>'team_id' is not distinct from f.payload->>'team_id' and newer.recorded_at>f.recorded_at)),'[]'),
 'selections',coalesce((select jsonb_agg(to_jsonb(s)-'author_id') from public.sports_selections s join public.sports_games g on g.id=s.game_id where g.sport=p_sport and g.slug=p_slug),'[]'),
 'results',coalesce((select jsonb_agg(to_jsonb(r)) from public.sports_result_progress r join public.sports_games g on g.id=r.game_id where g.sport=p_sport and g.slug=p_slug),'[]'))
$$;
revoke all on function private.sports_source(jsonb),private.ingest_sports(jsonb),public.ingest_sports(jsonb),public.sports_feed_settings(text),public.sports_feed_checkpoint(text,jsonb) from public,anon,authenticated;
grant execute on function private.ingest_sports(jsonb),public.ingest_sports(jsonb),public.sports_feed_settings(text),public.sports_feed_checkpoint(text,jsonb) to service_role;
revoke all on function public.sports_slate(text,integer),public.sports_game(text,text) from public;
grant execute on function public.sports_slate(text,integer),public.sports_game(text,text) to anon,authenticated,service_role;
create function private.record_sport_result(p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare g public.sports_games;s uuid;fp text;prior public.sports_results;st private.sports_result_staging;r jsonb; side text;score integer;total integer;state text;reason text;shoot boolean;
begin
 select * into g from public.sports_games where sport=p->>'sport' and provider_id=p->>'provider_id';
 if not found then raise exception 'Unknown result game';end if;
 perform pg_advisory_xact_lock(hashtextextended('sport-result:'||g.id::text,0));
 s:=private.sports_source(p->'source');
 if p->>'completed' is distinct from 'true' or p->>'status' is distinct from 'STATUS_FINAL' then
  if exists(select 1 from public.sports_results where game_id=g.id) then return jsonb_build_object('status','RECHECK_REQUIRED');end if;
  state:=case when p->>'status' in ('STATUS_CANCELED','STATUS_POSTPONED','STATUS_SUSPENDED') then 'NO_RESULT' else 'AWAITING_FINAL' end;
  reason:='Source status '||coalesce(p->>'status','unknown');
 else
  if g.start_time>now() or coalesce(p->>'away_score','')!~'^\d+$' or coalesce(p->>'home_score','')!~'^\d+$' or p->>'away_score'=p->>'home_score'
  or jsonb_typeof(p->'players') is distinct from 'array' or jsonb_array_length(p->'players')=0 then raise exception 'Invalid final';end if;
  shoot:=coalesce((p->>'shootout')::boolean,false);
  if (select count(*)<>count(distinct x->>'athlete_id') from jsonb_array_elements(p->'players')x) then raise exception 'Duplicate athlete';end if;
  for r in select value from jsonb_array_elements(p->'players') loop
   if coalesce(r->>'athlete_id','')!~'^\d+$' or coalesce(r->>'player','')='' or coalesce(r->>'side','') not in ('away','home') or jsonb_typeof(r->'played') is distinct from 'boolean'
    or ((r->>'played')::boolean and (coalesce(r->>'points','')!~'^\d+$' or coalesce(r->>'assists','')!~'^\d+$' or coalesce(r->>'seconds','')!~'^\d+$'))
    or (g.sport='nhl' and (r->>'played')::boolean and (coalesce(r->>'goals','')!~'^\d+$' or (r->>'points')::int<>(r->>'goals')::int+(r->>'assists')::int)) then raise exception 'Invalid player final';end if;
  end loop;
  foreach side in array array['away','home'] loop
   score:=(p->>(side||'_score'))::int;
   select sum((x->>case when g.sport='nhl' then 'goals' else 'points' end)::int) into total from jsonb_array_elements(p->'players')x where x->>'side'=side and (x->>'played')::boolean;
   if total is null or (g.sport='ncaab' and total<>score) or (g.sport='nhl' and (total>score or score-total>1 or (not shoot and score<>total))) then raise exception 'Player score conservation failed';end if;
  end loop;
  if g.sport='nhl' and (p->>'away_score')::int+(p->>'home_score')::int-(select sum((x->>'goals')::int) from jsonb_array_elements(p->'players')x where (x->>'played')::boolean)<>(case when shoot then 1 else 0 end) then raise exception 'Shootout score conservation failed';end if;
  fp:=encode(sha256(convert_to(jsonb_build_object('away_score',p->'away_score','home_score',p->'home_score','shootout',shoot,'players',(select jsonb_agg(x order by x->>'athlete_id') from jsonb_array_elements(p->'players')x))::text,'UTF8')),'hex');
  select * into prior from public.sports_results where game_id=g.id;
  if found then
   if prior.fingerprint=fp then
    -- A prior conflict is sticky until reviewed; do not erase correction evidence.
    select status into state from public.sports_result_progress where game_id=g.id;
    state:=case when state='CONFLICT' then 'CONFLICT' else 'FINAL' end;reason:='Recorded final unchanged';
   else
    insert into private.sports_result_corrections(game_id,source_id,payload,fingerprint) values(g.id,s,p-'source',fp) on conflict do nothing;
    state:='CONFLICT';reason:='Source changed after recorded final; original retained';
   end if;
  else
   select * into st from private.sports_result_staging where game_id=g.id;
   if not found or st.fingerprint<>fp then
    insert into private.sports_result_staging values(g.id,fp,now()) on conflict(game_id) do update set fingerprint=excluded.fingerprint,first_seen_at=excluded.first_seen_at;
    state:='CONFIRMING';reason:='Consistent box score; waiting 3 hours for unchanged confirmation';
   elsif now()-st.first_seen_at<interval '3 hours' then state:='CONFIRMING';reason:='Confirmation interval not elapsed';
   else
    insert into public.sports_results(game_id,source_id,fingerprint,payload) values(g.id,s,fp,p-'source');state:='FINAL';reason:='Box score unchanged for 3 hours';
   end if;
  end if;
 end if;
 insert into public.sports_result_progress(game_id,status,reason) values(g.id,state,reason) on conflict(game_id) do update set status=excluded.status,reason=excluded.reason,checked_at=now();
 return jsonb_build_object('game_id',g.id,'status',state,'reason',reason);
end $$;
create function public.record_sport_result(p jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.record_sport_result(p)$$;
revoke all on function private.record_sport_result(jsonb),public.record_sport_result(jsonb) from public,anon,authenticated;
grant execute on function private.record_sport_result(jsonb),public.record_sport_result(jsonb) to service_role;
create function public.sports_grade_market(p_market uuid) returns text language plpgsql stable security invoker set search_path='' as $$
declare m jsonb;r jsonb;v numeric;line numeric;players jsonb;n integer;player jsonb;begin
 select payload into m from public.sports_markets where id=p_market;if not found then return 'PENDING';end if;
 select s.payload into r from public.sports_results s join public.sports_result_progress p using(game_id) where s.game_id=(m->>'game_id')::uuid and p.status='FINAL';if not found then return 'PENDING';end if;
 if m->>'market' in ('h2h','spreads') then
  if m->>'side' not in ('away','home') then return 'PENDING';end if;
  v:=case when m->>'side'='home' then (r->>'home_score')::numeric-(r->>'away_score')::numeric else (r->>'away_score')::numeric-(r->>'home_score')::numeric end;
  if m->>'market'='spreads' then v:=v+(m->>'line')::numeric;end if;
 elsif m->>'market'='totals' then v:=(r->>'away_score')::numeric+(r->>'home_score')::numeric;
 else
  select count(*),jsonb_agg(x) into n,players from jsonb_array_elements(r->'players')x where case when m->>'athlete_id' is not null then x->>'athlete_id'=m->>'athlete_id' else lower(x->>'player')=lower(m->>'player') end;
  if n<>1 then return 'PENDING';end if;player:=players->0;
  if coalesce((player->>'participation_uncertain')::boolean,false) then return 'PENDING';end if;
  if not (player->>'played')::boolean then return 'VOID';end if;
  v:=(player->>case when m->>'market'='player_points' then 'points' else 'goals' end)::numeric;
  if v is null then return 'PENDING';end if;
  if m->>'market'='player_goal_scorer_anytime' then return case when v>0 then 'WIN' else 'LOSS' end;end if;
 end if;
 if m->>'market' not in ('h2h','spreads') then
  if m->>'line' is null or m->>'direction' not in ('Over','Under') then return 'PENDING';end if;
  v:=(v-(m->>'line')::numeric)*case when m->>'direction'='Over' then 1 else -1 end;
 end if;
 return case when v>0 then 'WIN' when v=0 then 'PUSH' else 'LOSS' end;
end $$;
create function public.sports_records(p_sport text) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('selections',count(*),'win',count(*) filter(where grade='WIN'),'loss',count(*) filter(where grade='LOSS'),'push',count(*) filter(where grade='PUSH'),'void',count(*) filter(where grade='VOID'),'pending',count(*) filter(where grade='PENDING'))
 from (select public.sports_grade_market(s.market_id) grade from public.sports_selections s join public.sports_games g on g.id=s.game_id where g.sport=p_sport)x
$$;
create function public.sports_publish_selection(p_market uuid,p_title text,p_why text,p_risk text) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.sports_markets;g public.sports_games;s uuid;begin
 if auth.uid() is null or not private.is_admin() or not private.age_member_allowed() then raise exception 'Admin required';end if;
 select * into m from public.sports_markets where id=p_market;
 if not found then raise exception 'Unknown quote';end if;select * into g from public.sports_games where id=m.game_id;
 if now()>=m.expires_at or now()>=g.start_time or coalesce((g.payload->>'completed')::boolean,false) then raise exception 'Quote closed';end if;
 if length(trim(p_title)) not between 3 and 120 or length(trim(p_why)) not between 20 and 2000 or length(trim(p_risk)) not between 20 and 2000 then raise exception 'Analysis and risk required';end if;
 insert into public.sports_selections(game_id,market_id,title,why,risk,author_id,expires_at,sources)
 values(g.id,m.id,p_title,p_why,p_risk,auth.uid(),least(m.expires_at,g.start_time),jsonb_build_array(m.payload->'source')) returning id into s;
 -- One shared Zone; Claude's additive sport-constraint migration must land first.
 insert into public.community_posts(user_id,sport,kind,title,body,legs) values(auth.uid(),g.sport,'talk',p_title,p_why||E'\n\nRisk: '||p_risk||E'\n\nQualitative editorial. FanDuel quote observed '||(m.observed_at::text)||E'\n'||(m.payload->'source'->>'url'),array[]::text[]);
 return s;
end $$;
revoke all on function public.sports_grade_market(uuid),public.sports_records(text),public.sports_publish_selection(uuid,text,text,text) from public;
grant execute on function public.sports_grade_market(uuid),public.sports_records(text) to anon,authenticated,service_role;
grant execute on function public.sports_publish_selection(uuid,text,text,text) to authenticated;

-- Per-sport atomic daily credit budget; failed paid requests still consume their reservation.
alter table private.sports_feed_settings add column credit_day date,add column daily_reserved integer not null default 0,add column lease_until timestamptz;
create function public.sports_reserve_credits(p_sport text,p_cost integer) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_cost not between 1 and 3 then return false;end if;
 update private.sports_feed_settings set credit_day=(now() at time zone 'America/New_York')::date,
 daily_reserved=(case when credit_day=(now() at time zone 'America/New_York')::date then daily_reserved else 0 end)+p_cost
 where sport=p_sport and (credits_remaining is null or credits_remaining>1000)
 and (case when credit_day=(now() at time zone 'America/New_York')::date then daily_reserved else 0 end)+p_cost<=case when p_sport='nhl' then 150 else 50 end;
 return found;
end $$;
create function public.sports_refresh_lease(p_sport text,p_release boolean default false) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_release then update private.sports_feed_settings set lease_until=null where sport=p_sport;return true;end if;
 update private.sports_feed_settings set lease_until=now()+interval '5 minutes' where sport=p_sport and (lease_until is null or lease_until<now());return found;
end $$;
revoke all on function public.sports_reserve_credits(text,integer),public.sports_refresh_lease(text,boolean) from public,anon,authenticated;
grant execute on function public.sports_reserve_credits(text,integer),public.sports_refresh_lease(text,boolean) to service_role;
