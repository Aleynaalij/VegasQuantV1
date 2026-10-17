-- NBA shadow model journal (step 4 of the NBA build). Research only: the NBA v0.1 model
-- (research/nba/engine.py, artifact research/nba/artifacts/v0.1) is run before tip-off against real
-- player-prop prices collected by nba-sync, and every forecast is stored here, unchangeable, before the
-- game starts. Grading reuses public.nba_grade on the recorded box scores, so there is no separate
-- outcome table. Nothing here creates picks, publishes, touches NFL tables or the NFL selection gate.

-- Box-score fields the live model needs (rows recorded before this migration keep nulls).
alter table public.nba_player_results add column starter boolean, add column position text;

-- record_nba_result, unchanged except that it now also stores starter and position (both optional).
create or replace function private.record_nba_result(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g public.nba_games; prior public.nba_game_results; st private.nba_result_staging;
 fp text; s text; side jsonb; bad text; n integer;
 begin
 if octet_length(p::text) > 500000 then raise exception 'Result payload too large'; end if;
 select * into g from public.nba_games where provider_id = p->>'provider_id';
 if not found then raise exception 'Unknown NBA game'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nba-result:'||g.id::text, 0));

 if coalesce(p->>'completed','') <> 'true' then
  delete from private.nba_result_staging where game_id = g.id;
  if exists (select 1 from public.nba_game_results where game_id = g.id) then
   return jsonb_build_object('status', (select status from public.nba_result_progress where game_id = g.id));
  end if;
  s := case when p->>'status' in ('STATUS_POSTPONED','STATUS_CANCELED','STATUS_SUSPENDED') then 'NO_RESULT' else 'AWAITING_FINAL' end;
  insert into public.nba_result_progress(game_id,status,reason,checked_at)
  values(g.id, s, left('ESPN status '||coalesce(p->>'status','unknown'), 200), now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status', s);
 end if;

 -- Shape and identity checks: these are errors in the caller, not data states.
 if g.tipoff > now() then raise exception 'Game has not started'; end if;
 if p->>'source_url' is distinct from 'https://www.espn.com/nba/boxscore/_/gameId/'||g.provider_id
    or coalesce(p->>'source_hash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid result evidence'; end if;
 if p->'away'->>'team' is distinct from g.away_team or p->'home'->>'team' is distinct from g.home_team then
  raise exception 'Teams do not match the scheduled game'; end if;
 if jsonb_typeof(p->'players') <> 'array' or exists (
   select 1 from jsonb_array_elements(p->'players') x
   where coalesce(x->>'athlete_id','') !~ '^\d+$' or coalesce(x->>'player','') = '' or x->>'side' not in ('away','home')
      or jsonb_typeof(x->'played') <> 'boolean'
      or exists (select 1 from unnest(array['points','rebounds','assists','threes','steals','blocks','turnovers']) k where coalesce(x->>k,'') !~ '^\d+$')
      or (x ? 'minutes' and jsonb_typeof(x->'minutes') <> 'null' and coalesce(x->>'minutes','') !~ '^\d+$')
      or (x ? 'starter' and jsonb_typeof(x->'starter') not in ('boolean','null'))
      or coalesce(x->>'position','') !~ '^[A-Z]{0,3}$')
   or (select count(distinct x->>'athlete_id') <> count(*) from jsonb_array_elements(p->'players') x) then
  raise exception 'Invalid player rows'; end if;

 -- Box score consistency, per team.
 for s in select unnest(array['away','home']) loop
  side := p->s;
  select count(*) filter (where (x->>'played')::boolean) into n from jsonb_array_elements(p->'players') x where x->>'side' = s;
  select case
   when coalesce(side->>'score','') !~ '^\d+$' then 'missing '||s||' score'
   when n < 5 then 'fewer than five '||s||' players played'
   when sum((x->>'points')::int) is distinct from (side->>'score')::int then s||' player points do not add up to the final score'
   when sum((x->>'rebounds')::int) is distinct from (side->>'rebounds')::int then s||' rebounds do not match the team total'
   when sum((x->>'assists')::int) is distinct from (side->>'assists')::int then s||' assists do not match the team total'
   when sum((x->>'threes')::int) is distinct from (side->>'threes')::int then s||' threes do not match the team total'
   when bool_or(not (x->>'played')::boolean and ((x->>'points')::int + (x->>'rebounds')::int + (x->>'assists')::int) > 0) then s||' non-playing player has stats'
  end into bad from jsonb_array_elements(p->'players') x where x->>'side' = s;
  exit when bad is not null;
 end loop;
 if bad is null and (p->'away'->>'score')::int = (p->'home'->>'score')::int then bad := 'final score is tied'; end if;

 -- Fingerprint of what gets recorded: scores, overtime and every player's line, in athlete order.
 fp := encode(sha256(convert_to(jsonb_build_object(
  'away', (p->'away'->>'score'), 'home', (p->'home'->>'score'), 'ot', coalesce(p->>'overtime','false'),
  'players', (select jsonb_agg(jsonb_build_array(x->>'athlete_id', x->>'player', x->>'side', x->>'played', x->>'minutes',
    x->>'points', x->>'rebounds', x->>'assists', x->>'threes', x->>'steals', x->>'blocks', x->>'turnovers') order by (x->>'athlete_id')::bigint)
   from jsonb_array_elements(p->'players') x))::text, 'UTF8')), 'hex');

 -- Already recorded: only look for provider corrections. Any changed box score is a correction,
 -- including one that no longer adds up.
 select * into prior from public.nba_game_results where game_id = g.id;
 if found then
  if fp = prior.fingerprint then
   update public.nba_result_progress set checked_at = now() where game_id = g.id;
   return jsonb_build_object('status', (select status from public.nba_result_progress where game_id = g.id));
  end if;
  insert into private.nba_result_corrections(game_id, recorded_fingerprint, observed_fingerprint, observed, source_hash)
  values(g.id, prior.fingerprint, fp, p, p->>'source_hash') on conflict (game_id, observed_fingerprint) do nothing;
  update public.nba_result_progress set status='CONFLICT', reason='ESPN changed the box score after it was recorded; recorded result kept for review', checked_at=now()
  where game_id = g.id;
  return jsonb_build_object('status','CONFLICT');
 end if;

 if bad is not null then
  delete from private.nba_result_staging where game_id = g.id;
  insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'INCONSISTENT',left('Box score does not add up: '||bad,200),now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status','INCONSISTENT','reason',bad);
 end if;

 -- Stage the first consistent final read; record once the same fingerprint is seen 3 hours later.
 select * into st from private.nba_result_staging where game_id = g.id;
 if not found or st.fingerprint <> fp then
  s := case when st.game_id is null then 'Final box score adds up; confirming in 3 hours' else 'Box score changed since the last read; confirmation restarted' end;
  insert into private.nba_result_staging(game_id, fingerprint) values(g.id, fp)
  on conflict(game_id) do update set fingerprint=excluded.fingerprint, first_seen_at=now(), last_seen_at=now();
 elsif now() - st.first_seen_at < interval '3 hours' then
  update private.nba_result_staging set last_seen_at = now() where game_id = g.id;
  s := 'Final box score unchanged; confirming in 3 hours';
 else
  insert into public.nba_game_results(game_id, provider_id, away_score, home_score, overtime, fingerprint, source_url, source_hash, first_final_at)
  values(g.id, g.provider_id, (p->'away'->>'score')::int, (p->'home'->>'score')::int, coalesce((p->>'overtime')::boolean,false),
   fp, p->>'source_url', p->>'source_hash', st.first_seen_at);
  insert into public.nba_player_results(game_id, athlete_id, player, team, side, played, minutes, points, rebounds, assists, threes, steals, blocks, turnovers, starter, position)
  select g.id, x->>'athlete_id', x->>'player', case when x->>'side'='away' then g.away_team else g.home_team end, x->>'side',
   (x->>'played')::boolean, (x->>'minutes')::int, (x->>'points')::int, (x->>'rebounds')::int, (x->>'assists')::int,
   (x->>'threes')::int, (x->>'steals')::int, (x->>'blocks')::int, (x->>'turnovers')::int, (x->>'starter')::boolean, nullif(x->>'position','')
  from jsonb_array_elements(p->'players') x;
  delete from private.nba_result_staging where game_id = g.id;
  insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'FINAL','Final box score adds up and was unchanged for 3 hours',now())
  on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
  return jsonb_build_object('status','FINAL','recorded',true);
 end if;
 insert into public.nba_result_progress(game_id,status,reason,checked_at) values(g.id,'CONFIRMING',s,now())
 on conflict(game_id) do update set status=excluded.status, reason=excluded.reason, checked_at=now();
 return jsonb_build_object('status','CONFIRMING');
end $$;

-- Registered model artifacts. Shadow only: no NBA selection path exists.
create table private.nba_shadow_models(
 model_id text primary key check(model_id ~ '^[a-f0-9]{64}$'),
 artifact_sha256 text not null check(artifact_sha256 ~ '^[a-f0-9]{64}$'),
 artifact_url text not null check(artifact_url like 'https://raw.githubusercontent.com/Aleynaalij/VegasQuantV1/%'),
 markets text[] not null, status text not null default 'SHADOW_ONLY' check(status = 'SHADOW_ONLY'),
 registered_at timestamptz not null default now()
);
insert into private.nba_shadow_models(model_id, artifact_sha256, artifact_url, markets) values(
 '20df1c2b74b1f013fa472bb348bdfcf234455ab73de40ec057f5108e59e350e4',
 '2e3257b50eb14be686f9bc02090b54136e5ee68e616943b151e7c7076688515b',
 'https://raw.githubusercontent.com/Aleynaalij/VegasQuantV1/main/research/nba/artifacts/v0.1/model.json',
 array['player_points','player_rebounds']);

create table private.nba_shadow_runs(
 id uuid primary key default gen_random_uuid(),
 model_id text not null references private.nba_shadow_models(model_id),
 generated_at timestamptz not null, recorded_at timestamptz not null default now(),
 summary jsonb not null check(jsonb_typeof(summary) = 'object'),
 unique(model_id, generated_at)
);
-- One pregame forecast per model, price snapshot, player, market and line. The book and prices are
-- checked against the stored observation, so a forecast always points at a real quote.
create table private.nba_shadow_forecasts(
 id bigint generated always as identity primary key,
 run_id uuid not null references private.nba_shadow_runs(id),
 model_id text not null references private.nba_shadow_models(model_id),
 game_id uuid not null references public.nba_games(id),
 observation_id uuid not null references public.nba_observations(id),
 athlete_id text not null check(athlete_id ~ '^\d+$'), player text not null, team text not null,
 market text not null check(market in ('player_points','player_rebounds')),
 line numeric not null check(line >= 0 and line * 2 = round(line * 2) and line <> trunc(line)),
 book text not null, over_odds integer not null check(abs(over_odds) >= 100), under_odds integer check(abs(under_odds) >= 100),
 over_probability numeric not null check(over_probability > 0 and over_probability < 1),
 no_vig_over numeric check(no_vig_over > 0 and no_vig_over < 1),
 forecast jsonb not null check(jsonb_typeof(forecast) = 'object'),
 observed_at timestamptz not null, recorded_at timestamptz not null default now(),
 unique(model_id, observation_id, player, market, line)
);
create index nba_shadow_forecasts_game_idx on private.nba_shadow_forecasts(game_id);
create table private.nba_shadow_reports(
 id bigint generated always as identity primary key,
 model_id text not null references private.nba_shadow_models(model_id),
 generated_at timestamptz not null default now(),
 report jsonb not null check(jsonb_typeof(report) = 'object')
);
create trigger immutable_nba_shadow_run before update or delete on private.nba_shadow_runs for each row execute function private.immutable();
create trigger immutable_nba_shadow_forecast before update or delete on private.nba_shadow_forecasts for each row execute function private.immutable();
create trigger immutable_nba_shadow_report before update or delete on private.nba_shadow_reports for each row execute function private.immutable();
alter table private.nba_shadow_models enable row level security;
alter table private.nba_shadow_runs enable row level security;
alter table private.nba_shadow_forecasts enable row level security;
alter table private.nba_shadow_reports enable row level security;
revoke all on private.nba_shadow_models, private.nba_shadow_runs, private.nba_shadow_forecasts, private.nba_shadow_reports
 from public, anon, authenticated, service_role;

create function private.american_implied(o numeric) returns numeric language sql immutable set search_path='' as $$
 select case when o > 0 then 100 / (o + 100) else -o / (-o + 100) end
$$;

-- Records one hosted scan. p: model_id, generated_at, summary, forecasts[] {observation_id, athlete_id,
-- player, team, market, line, over_odds, under_odds, over_probability, forecast}. Rejects the whole scan
-- if any forecast is late, stale or does not match its stored price snapshot. Replays add nothing.
create function private.record_nba_shadow_scan(p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare run uuid; r jsonb; o public.nba_observations; g public.nba_games; at timestamptz; inserted integer := 0; under integer;
begin
 if octet_length(p::text) > 3000000 or jsonb_array_length(coalesce(p->'forecasts','[]')) > 3000 then raise exception 'Scan too large'; end if;
 if not exists (select 1 from private.nba_shadow_models where model_id = p->>'model_id' and status = 'SHADOW_ONLY') then
  raise exception 'Unregistered NBA model'; end if;
 at := (p->>'generated_at')::timestamptz;
 if at is null or at > now() or at < now() - interval '15 minutes' then raise exception 'Scan is not current'; end if;
 insert into private.nba_shadow_runs(model_id, generated_at, summary) values(p->>'model_id', at, coalesce(p->'summary','{}'))
 on conflict(model_id, generated_at) do nothing returning id into run;
 if run is null then return jsonb_build_object('inserted', 0, 'replay', true); end if;
 for r in select value from jsonb_array_elements(coalesce(p->'forecasts','[]')) loop
  select * into o from public.nba_observations where id = (r->>'observation_id')::uuid and kind = 'prop';
  if not found then raise exception 'Unknown prop observation'; end if;
  select * into g from public.nba_games where id = o.game_id;
  if g.tipoff <= now() then raise exception 'Game has started'; end if;
  if o.recorded_at < now() - interval '30 minutes' then raise exception 'Price snapshot is stale'; end if;
  if r->>'market' is distinct from o.payload->>'market' then raise exception 'Market does not match the snapshot'; end if;
  if r->>'team' not in (g.away_team, g.home_team) then raise exception 'Team is not in this game'; end if;
  if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Over'
     and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'over_odds')::int) then
   raise exception 'Over price does not match the snapshot'; end if;
  under := null;
  if r ? 'under_odds' and jsonb_typeof(r->'under_odds') <> 'null' then
   if not exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name' = 'Under'
      and x->>'description' = r->>'player' and (x->>'point')::numeric = (r->>'line')::numeric and (x->>'price')::int = (r->>'under_odds')::int) then
    raise exception 'Under price does not match the snapshot'; end if;
   under := (r->>'under_odds')::int;
  end if;
  insert into private.nba_shadow_forecasts(run_id, model_id, game_id, observation_id, athlete_id, player, team, market, line, book,
   over_odds, under_odds, over_probability, no_vig_over, forecast, observed_at)
  values(run, p->>'model_id', g.id, o.id, r->>'athlete_id', r->>'player', r->>'team', r->>'market', (r->>'line')::numeric,
   o.payload->>'book', (r->>'over_odds')::int, under, (r->>'over_probability')::numeric,
   case when under is null then null else private.american_implied((r->>'over_odds')::int)
     / (private.american_implied((r->>'over_odds')::int) + private.american_implied(under)) end,
   coalesce(r->'forecast','{}'), coalesce(o.observed_at, o.recorded_at))
  on conflict(model_id, observation_id, player, market, line) do nothing;
  if found then inserted := inserted + 1; end if;
 end loop;
 return jsonb_build_object('inserted', inserted, 'run_id', run);
end $$;
create function public.record_nba_shadow_scan(p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.record_nba_shadow_scan(p) $$;

-- Forecasts for games that have started, with the Over grade from nba_grade and the closing price:
-- the same book's last snapshot of the same player, market and line before tip-off. Paged by id.
create function private.nba_shadow_evaluation_rows(p_model text, p_after bigint default 0, p_limit integer default 1000)
returns table(id bigint, game_id uuid, tipoff timestamptz, observed_at timestamptz, athlete_id text, player text, team text,
 market text, line numeric, book text, over_odds integer, under_odds integer, over_probability numeric, no_vig_over numeric,
 result text, close_over_odds integer, close_under_odds integer, close_observed_at timestamptz)
language sql stable security definer set search_path='' as $$
 select f.id, f.game_id, g.tipoff, f.observed_at, f.athlete_id, f.player, f.team, f.market, f.line, f.book, f.over_odds, f.under_odds,
  f.over_probability, f.no_vig_over, public.nba_grade(f.game_id, f.market, 'Over', f.line, f.player),
  (select (x->>'price')::int from jsonb_array_elements(c.payload->'outcomes') x where x->>'name'='Over' and x->>'description'=f.player and (x->>'point')::numeric=f.line limit 1),
  (select (x->>'price')::int from jsonb_array_elements(c.payload->'outcomes') x where x->>'name'='Under' and x->>'description'=f.player and (x->>'point')::numeric=f.line limit 1),
  coalesce(c.observed_at, c.recorded_at)
 from private.nba_shadow_forecasts f
 join public.nba_games g on g.id = f.game_id
 left join lateral (
  select o.* from public.nba_observations o
  where o.game_id = f.game_id and o.kind = 'prop' and o.payload->>'book' = f.book and o.payload->>'market' = f.market
   and o.recorded_at < g.tipoff
   and exists (select 1 from jsonb_array_elements(o.payload->'outcomes') x where x->>'name'='Over' and x->>'description'=f.player and (x->>'point')::numeric=f.line)
  order by o.recorded_at desc limit 1) c on true
 where f.model_id = p_model and f.id > p_after and g.tipoff < now()
 order by f.id limit least(greatest(p_limit, 1), 1000)
$$;
create function public.nba_shadow_evaluation_rows(p_model text, p_after bigint default 0, p_limit integer default 1000)
returns table(id bigint, game_id uuid, tipoff timestamptz, observed_at timestamptz, athlete_id text, player text, team text,
 market text, line numeric, book text, over_odds integer, under_odds integer, over_probability numeric, no_vig_over numeric,
 result text, close_over_odds integer, close_under_odds integer, close_observed_at timestamptz)
language sql stable security invoker set search_path='' as $$ select * from private.nba_shadow_evaluation_rows(p_model, p_after, p_limit) $$;

create function private.record_nba_shadow_report(p jsonb) returns bigint
language sql security definer set search_path='' as $$
 insert into private.nba_shadow_reports(model_id, report) values(p->>'model_id', p->'report') returning id
$$;
create function public.record_nba_shadow_report(p jsonb) returns bigint
language sql security invoker set search_path='' as $$ select private.record_nba_shadow_report(p) $$;

revoke all on function private.record_nba_shadow_scan(jsonb), public.record_nba_shadow_scan(jsonb),
 private.nba_shadow_evaluation_rows(text,bigint,integer), public.nba_shadow_evaluation_rows(text,bigint,integer),
 private.record_nba_shadow_report(jsonb), public.record_nba_shadow_report(jsonb), private.american_implied(numeric)
 from public, anon, authenticated;
grant execute on function private.record_nba_shadow_scan(jsonb), public.record_nba_shadow_scan(jsonb),
 private.nba_shadow_evaluation_rows(text,bigint,integer), public.nba_shadow_evaluation_rows(text,bigint,integer),
 private.record_nba_shadow_report(jsonb), public.record_nba_shadow_report(jsonb) to service_role;
